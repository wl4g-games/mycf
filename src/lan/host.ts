import { GAME_MODES, MATCH_CONDITIONS } from "../../ws-server/src/game-config.js";
import { AuthoritativeMatch } from "../../ws-server/src/match.js";

import {
  LanEventEmitter, closePeer, createCompleteOffer, createHostDataChannels, createLanPeerConnection,
  peerDebug, sendChannel, type LanDataChannels,
} from "./peer.ts";
import {
  LAN_MAX_PLAYERS, LAN_PROTOCOL_VERSION, LAN_SIGNAL_TTL_MS, LAN_SNAPSHOT_HZ,
  createLanId, decodeWireMessage, encodeWireMessage,
  type LanCombatEvent, type LanInputMessage, type LanMatchResult, type LanMatchStartPayload,
  type LanPeerDebug, type LanPlayerProfile, type LanReliableMessage, type LanRoomSettings,
  type LanRoomState, type LanSignalEnvelope, type LanSnapshot,
} from "./protocol.ts";
import { decodeLanSignal, encodeLanSignal } from "./qr-signaling.ts";

interface HostPeer {
  slotId: string;
  peer: RTCPeerConnection;
  channels: LanDataChannels;
  profile: LanPlayerProfile | null;
  lastInputSeq: number;
  rttMs: number | null;
  pendingPings: Map<string, number>;
  createdAt: number;
  offerCode: string | null;
}

interface MatchLike {
  rules: { timeLimit: number };
  endsAt: number;
  finished: boolean;
  update(dt: number): void;
  setInput(userId: string, payload: object): void;
  snapshotFor(userId: string): LanSnapshot;
  assignmentFor(userId: string): { actorId: string; team: "seal" | "terror" } | null;
  removeHuman(userId: string): void;
}

const ALIAS_PATTERN = /^[\p{L}\p{N}_\-\s]{2,16}$/u;

function normalizeAlias(value: unknown): string {
  const alias = String(value || "").trim().replace(/\s+/gu, " ");
  return ALIAS_PATTERN.test(alias) ? alias : "";
}

function shortCode(id: string): string {
  return id.replaceAll("-", "").slice(-6).toUpperCase();
}

export class LanHost extends LanEventEmitter {
  readonly role = "host" as const;
  readonly self: LanPlayerProfile;
  readonly roomId: string;
  readonly peers = new Map<string, HostPeer>();
  readonly users: LanPlayerProfile[] = [];
  connected = true;
  room: LanRoomState;
  interpolateSnapshots = false;
  private match: MatchLike | null = null;
  private snapshotAccumulator = 0;
  private snapshotSequence = 0;
  private pingAccumulator = 0;
  private vitalState = new Map<string, string>();
  private closed = false;

  constructor(profile: Omit<LanPlayerProfile, "id" | "isHost">, settings: LanRoomSettings) {
    super();
    this.self = {
      ...profile,
      id: createLanId("host"),
      alias: normalizeAlias(profile.alias),
      isHost: true,
    };
    if (!this.self.alias) throw new Error("Use a 2–16 character LAN callsign.");
    this.roomId = shortCode(createLanId("room"));
    const modes = GAME_MODES as Record<string, (typeof GAME_MODES)[keyof typeof GAME_MODES]>;
    const conditions = MATCH_CONDITIONS as Record<string, (typeof MATCH_CONDITIONS)[keyof typeof MATCH_CONDITIONS]>;
    const mode = modes[settings.modeId] || GAME_MODES["4v4"];
    const condition = conditions[settings.conditionId] || MATCH_CONDITIONS.standard;
    this.room = {
      id: this.roomId,
      ownerId: this.self.id,
      mapId: settings.mapId,
      modeId: mode.id,
      conditionId: condition.id,
      killTarget: condition.killTarget,
      timeLimit: condition.timeLimit,
      status: "waiting",
      maxHumans: Math.min(LAN_MAX_PLAYERS, mode.teamSize * 2),
      members: [this.self],
    };
  }

  get minimumPlayers(): number {
    return Math.min(2, this.room.maxHumans);
  }

  get debugPeers(): LanPeerDebug[] {
    return [...this.peers.values()].map(record => peerDebug(
      record.profile?.id || record.slotId,
      record.profile?.alias || "PAIRING",
      record.peer,
      record.channels,
      record.rttMs,
    ));
  }

  async createOffer(): Promise<string> {
    if (this.closed) throw new Error("This LAN room has ended.");
    const existing = [...this.peers.values()].find(record => !record.profile);
    if (existing && Date.now() - existing.createdAt > LAN_SIGNAL_TTL_MS) {
      this.dropPeer(existing, "offer_expired", false);
      return this.createOffer();
    }
    if (existing?.offerCode) return existing.offerCode;
    if (existing) throw new Error("The current LAN offer is still being prepared.");
    const pending = [...this.peers.values()].filter(record => !record.profile).length;
    if (this.room.members.length + pending >= this.room.maxHumans) throw new Error("This LAN room has reached the selected battle capacity.");
    if (this.room.status !== "waiting") throw new Error("New players can only pair before the match starts.");

    const slotId = createLanId("slot");
    const peer = createLanPeerConnection();
    const channels = createHostDataChannels(peer);
    const record: HostPeer = {
      slotId,
      peer,
      channels,
      profile: null,
      lastInputSeq: -1,
      rttMs: null,
      pendingPings: new Map(),
      createdAt: Date.now(),
      offerCode: null,
    };
    this.peers.set(slotId, record);
    this.bindPeer(record);
    try {
      const description = await createCompleteOffer(peer);
      const signal: LanSignalEnvelope = {
        version: LAN_PROTOCOL_VERSION,
        kind: "offer",
        roomId: this.roomId,
        slotId,
        createdAt: record.createdAt,
        description,
      };
      this.emitDebug();
      record.offerCode = encodeLanSignal(signal);
      return record.offerCode;
    } catch (error) {
      this.dropPeer(record, "offer_failed", false);
      throw error;
    }
  }

  async acceptAnswer(value: string): Promise<void> {
    const answer = decodeLanSignal(value, "answer");
    if (answer.roomId !== this.roomId) throw new Error("This answer belongs to a different LAN room.");
    const record = this.peers.get(answer.slotId);
    if (!record) throw new Error("This LAN pairing slot is no longer active.");
    await record.peer.setRemoteDescription(answer.description);
    this.emitDebug();
  }

  updateProfile(loadoutId: string, characterId: string): boolean {
    this.self.loadoutId = loadoutId;
    this.self.characterId = characterId;
    this.room.members = this.room.members.map(member => member.id === this.self.id ? { ...this.self } : member);
    if (this.room.status === "waiting") this.broadcastRoom();
    return true;
  }

  startRoom(): boolean {
    if (this.room.status !== "waiting" || this.match) return false;
    if (this.room.members.length < this.minimumPlayers) {
      this.emit("error", { code: "LAN_NEEDS_PLAYERS", message: `Connect at least ${this.minimumPlayers} players before starting.` });
      return false;
    }
    this.room.status = "playing";
    this.match = new AuthoritativeMatch(
      this.room,
      this.room.members,
      (event: LanCombatEvent) => this.broadcastCombatEvent(event),
      (result: LanMatchResult) => this.finishMatch(result),
    ) as MatchLike;
    this.vitalState.clear();
    for (const member of this.room.members) {
      const assignment = this.match.assignmentFor(member.id);
      if (!assignment) continue;
      const payload: LanMatchStartPayload = {
        room: this.publicRoom(),
        assignment,
        duration: this.match.rules.timeLimit,
        endsAt: this.match.endsAt,
      };
      if (member.id === this.self.id) this.emit("match_start", payload);
      else this.sendReliableToMember(member.id, { type: "match_start", payload });
    }
    this.broadcastRoom();
    return true;
  }

  sendInput(input: { movement?: LanInputMessage["move"]; angle?: number; fireHeld?: boolean; actions?: LanInputMessage["actions"] }): boolean {
    if (!this.match) return false;
    this.match.setInput(this.self.id, input);
    return true;
  }

  tick(dt: number): void {
    if (this.closed) return;
    const delta = Math.min(.1, Math.max(0, Number(dt) || 0));
    this.pingAccumulator += delta;
    if (this.pingAccumulator >= 1) {
      this.pingAccumulator %= 1;
      this.pingPeers();
    }
    if (!this.match || this.match.finished) return;
    this.match.update(delta);
    if (!this.match) return;
    this.broadcastVitalChanges();
    this.snapshotAccumulator += delta;
    if (this.snapshotAccumulator < 1 / LAN_SNAPSHOT_HZ) return;
    this.snapshotAccumulator %= 1 / LAN_SNAPSHOT_HZ;
    this.broadcastSnapshots();
  }

  leaveRoom(): boolean {
    this.close("host_left");
    return true;
  }

  close(reason = "host_closed"): void {
    if (this.closed) return;
    this.closed = true;
    for (const record of [...this.peers.values()]) {
      this.sendReliable(record, { type: "host_closed", reason });
      closePeer(record.peer, record.channels);
    }
    this.peers.clear();
    this.match = null;
    this.connected = false;
    this.room.status = "finished";
    this.emit("room_left", {});
    this.emit("status", { connected: false, code: "LAN_HOST_CLOSED" });
    this.emitDebug();
  }

  private bindPeer(record: HostPeer): void {
    const update = () => this.emitDebug();
    record.peer.addEventListener("connectionstatechange", () => {
      update();
      if (record.peer.connectionState === "failed" || record.peer.connectionState === "closed") {
        this.dropPeer(record, "connection_closed", false);
      }
    });
    record.peer.addEventListener("iceconnectionstatechange", update);
    for (const channel of [record.channels.state, record.channels.reliable]) {
      channel.addEventListener("open", update);
      channel.addEventListener("close", () => {
        update();
        if (!this.closed && channel === record.channels.reliable) this.dropPeer(record, "channel_closed", false);
      });
      channel.addEventListener("error", update);
    }
    record.channels.state.addEventListener("message", event => this.receiveState(record, event.data));
    record.channels.reliable.addEventListener("message", event => this.receiveReliable(record, event.data));
  }

  private receiveState(record: HostPeer, raw: unknown): void {
    const message = decodeWireMessage(raw);
    if (!record.profile || message?.type !== "input"
      || !Number.isSafeInteger(message.seq) || message.seq <= record.lastInputSeq
      || !message.move || !message.aim || !Number.isFinite(message.aim.angle)) return;
    record.lastInputSeq = message.seq;
    this.match?.setInput(record.profile.id, {
      movement: message.move,
      angle: message.aim.angle,
      fireHeld: message.fire,
      actions: message.actions,
    });
  }

  private receiveReliable(record: HostPeer, raw: unknown): void {
    const message = decodeWireMessage(raw);
    if (!message) return;
    if (message.type === "join" && message.profile && typeof message.profile === "object") this.registerPeer(record, message.profile);
    if (message.type === "leave") this.dropPeer(record, "client_left", false);
    if (message.type === "profile" && record.profile && this.room.status === "waiting") {
      record.profile.loadoutId = message.loadoutId;
      record.profile.characterId = message.characterId;
      this.room.members = this.room.members.map(member => member.id === record.profile!.id ? { ...record.profile! } : member);
      this.broadcastRoom();
    }
    if (message.type === "ping") this.sendReliable(record, { type: "pong", nonce: message.nonce, sentAt: message.sentAt });
    if (message.type === "pong") {
      const startedAt = record.pendingPings.get(message.nonce);
      if (startedAt != null) {
        record.pendingPings.delete(message.nonce);
        record.rttMs = Math.max(0, performance.now() - startedAt);
        this.emitDebug();
      }
    }
  }

  private registerPeer(record: HostPeer, profile: Omit<LanPlayerProfile, "id" | "isHost">): void {
    if (record.profile) return;
    const alias = normalizeAlias(profile.alias);
    if (!alias) return this.rejectPeer(record, "BAD_ALIAS", "Use a 2–16 character LAN callsign.");
    if (this.room.status !== "waiting") return this.rejectPeer(record, "MATCH_STARTED", "This LAN match has already started.");
    if (this.room.members.length >= this.room.maxHumans) return this.rejectPeer(record, "ROOM_FULL", "This LAN room is full.");
    if (this.room.members.some(member => member.alias.toLocaleLowerCase() === alias.toLocaleLowerCase())) {
      return this.rejectPeer(record, "ALIAS_TAKEN", "That LAN callsign is already in use.");
    }
    record.profile = {
      id: `client-${record.slotId}`,
      alias,
      loadoutId: String(profile.loadoutId || "recon"),
      characterId: String(profile.characterId || "maleAgent"),
      isHost: false,
    };
    this.room.members = [...this.room.members, record.profile];
    this.sendReliable(record, { type: "joined", self: record.profile, room: this.publicRoom() });
    this.broadcastRoom();
    this.emit("player_joined", record.profile);
    this.emitDebug();
  }

  private rejectPeer(record: HostPeer, code: string, message: string): void {
    this.sendReliable(record, { type: "error", code, message });
    globalThis.setTimeout(() => this.dropPeer(record, code.toLowerCase(), false), 100);
  }

  private dropPeer(record: HostPeer, reason: string, notify: boolean): void {
    if (!this.peers.has(record.slotId)) return;
    if (notify) this.sendReliable(record, { type: "host_closed", reason });
    this.peers.delete(record.slotId);
    closePeer(record.peer, record.channels);
    if (record.profile) {
      this.match?.removeHuman(record.profile.id);
      this.room.members = this.room.members.filter(member => member.id !== record.profile!.id);
      this.emit("player_left", { player: record.profile, reason });
      this.broadcastRoom();
    }
    this.emitDebug();
  }

  private publicRoom(): LanRoomState {
    return { ...this.room, members: this.room.members.map(member => ({ ...member })) };
  }

  private broadcastRoom(): void {
    const room = this.publicRoom();
    this.room = room;
    this.emit("room_state", room);
    this.broadcastReliable({ type: "room_state", room });
  }

  private broadcastCombatEvent(event: LanCombatEvent): void {
    this.emit("combat_event", event);
    this.broadcastReliable({ type: "combat_event", event });
  }

  private finishMatch(result: LanMatchResult): void {
    this.emit("match_end", result);
    this.broadcastReliable({ type: "match_end", result });
    this.match = null;
    this.room.status = "waiting";
    this.broadcastRoom();
  }

  private broadcastSnapshots(): void {
    if (!this.match) return;
    const seq = ++this.snapshotSequence;
    const sentAt = performance.now();
    this.emit("snapshot", this.match.snapshotFor(this.self.id));
    for (const record of this.peers.values()) {
      if (!record.profile || record.channels.state.bufferedAmount > 128 * 1024) continue;
      sendChannel(record.channels.state, encodeWireMessage({
        type: "snapshot",
        seq,
        sentAt,
        snapshot: this.match.snapshotFor(record.profile.id),
      }));
    }
  }

  private broadcastVitalChanges(): void {
    if (!this.match) return;
    const snapshot = this.match.snapshotFor(this.self.id);
    for (const actor of snapshot.actors) {
      const signature = `${actor.health}|${actor.alive}|${actor.kills}|${actor.deaths}`;
      if (this.vitalState.get(actor.id) === signature) continue;
      this.vitalState.set(actor.id, signature);
      const message: LanReliableMessage = {
        type: "vitals",
        actorId: actor.id,
        health: actor.health,
        alive: actor.alive,
        kills: actor.kills,
        deaths: actor.deaths,
        score: snapshot.score,
      };
      this.emit("vitals", message);
      this.broadcastReliable(message);
    }
  }

  private broadcastReliable(message: LanReliableMessage): void {
    for (const record of this.peers.values()) if (record.profile) this.sendReliable(record, message);
  }

  private sendReliableToMember(memberId: string, message: LanReliableMessage): boolean {
    const record = [...this.peers.values()].find(item => item.profile?.id === memberId);
    return record ? this.sendReliable(record, message) : false;
  }

  private sendReliable(record: HostPeer, message: LanReliableMessage): boolean {
    return sendChannel(record.channels.reliable, encodeWireMessage(message));
  }

  private pingPeers(): void {
    for (const record of this.peers.values()) {
      if (!record.profile || record.channels.reliable.readyState !== "open") continue;
      const nonce = createLanId("ping");
      const startedAt = performance.now();
      record.pendingPings.set(nonce, startedAt);
      if (record.pendingPings.size > 4) record.pendingPings.delete(record.pendingPings.keys().next().value!);
      this.sendReliable(record, { type: "ping", nonce, sentAt: startedAt });
    }
  }

  private emitDebug(): void {
    this.emit("debug", { role: this.role, peers: this.debugPeers });
  }
}
