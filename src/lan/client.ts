import {
  LanEventEmitter, closePeer, collectClientDataChannels, createCompleteAnswer,
  createLanPeerConnection, peerDebug, sendChannel, type LanDataChannels,
} from "./peer.ts";
import {
  LAN_PROTOCOL_VERSION, createLanId, decodeWireMessage, encodeWireMessage,
  type LanInputMessage, type LanPeerDebug, type LanPlayerProfile,
  type LanReliableMessage, type LanRoomState, type LanSignalEnvelope,
} from "./protocol.ts";
import { decodeLanSignal, encodeLanSignal } from "./qr-signaling.ts";

export interface LanClientProfile {
  alias: string;
  loadoutId: string;
  characterId: string;
}

export class LanClient extends LanEventEmitter {
  readonly role = "client" as const;
  readonly interpolateSnapshots = true;
  self: LanPlayerProfile | null = null;
  room: LanRoomState | null = null;
  users: LanPlayerProfile[] = [];
  connected = false;
  private readonly profile: LanClientProfile;
  private peer: RTCPeerConnection | null = null;
  private channels: LanDataChannels | null = null;
  private signal: LanSignalEnvelope | null = null;
  private inputSequence = 0;
  private lastSnapshotSequence = -1;
  private rttMs: number | null = null;
  private pingAccumulator = 0;
  private pendingPings = new Map<string, number>();
  private joined = false;
  private closed = false;

  constructor(profile: LanClientProfile) {
    super();
    this.profile = {
      alias: String(profile.alias || "").trim(),
      loadoutId: String(profile.loadoutId || "recon"),
      characterId: String(profile.characterId || "maleAgent"),
    };
  }

  get debugPeers(): LanPeerDebug[] {
    if (!this.peer) return [];
    const channels = this.channels || {};
    return [peerDebug(this.room?.ownerId || "host", "HOST", this.peer, channels, this.rttMs)];
  }

  async createAnswer(offerValue: string): Promise<string> {
    if (this.peer) throw new Error("This LAN client already has a pairing session.");
    const offer = decodeLanSignal(offerValue, "offer");
    const peer = createLanPeerConnection();
    this.peer = peer;
    this.signal = offer;
    collectClientDataChannels(peer, channels => {
      this.channels = channels;
      this.bindChannels(channels);
      this.emitDebug();
    });
    this.bindPeer(peer);
    try {
      await peer.setRemoteDescription(offer.description);
      const description = await createCompleteAnswer(peer);
      const answer: LanSignalEnvelope = {
        version: LAN_PROTOCOL_VERSION,
        kind: "answer",
        roomId: offer.roomId,
        slotId: offer.slotId,
        createdAt: Date.now(),
        description,
      };
      this.emitDebug();
      return encodeLanSignal(answer);
    } catch (error) {
      this.close("pairing_failed", false);
      throw error;
    }
  }

  updateProfile(loadoutId: string, characterId: string): boolean {
    this.profile.loadoutId = loadoutId;
    this.profile.characterId = characterId;
    if (this.self) {
      this.self = { ...this.self, loadoutId, characterId };
      this.users = this.room?.members.map(member => ({ ...member })) || this.users;
    }
    return this.sendReliable({ type: "profile", loadoutId, characterId });
  }

  sendInput(input: {
    movement?: { x?: number; y?: number };
    angle?: number;
    pitch?: number;
    fireHeld?: boolean;
    actions?: Array<[string, unknown?]>;
  }): boolean {
    const message: LanInputMessage = {
      type: "input",
      seq: ++this.inputSequence,
      move: {
        x: Number(input.movement?.x) || 0,
        y: Number(input.movement?.y) || 0,
      },
      aim: {
        angle: Number(input.angle) || 0,
        pitch: Number(input.pitch) || 0,
      },
      fire: Boolean(input.fireHeld),
      actions: Array.isArray(input.actions) ? input.actions : [],
    };
    return sendChannel(this.channels?.state, encodeWireMessage(message));
  }

  startRoom(): boolean {
    return false;
  }

  leaveRoom(): boolean {
    if (!this.closed) this.sendReliable({ type: "leave" });
    this.close("client_left", false);
    return true;
  }

  tick(dt: number): void {
    if (!this.connected || this.closed) return;
    this.pingAccumulator += Math.max(0, Math.min(.1, Number(dt) || 0));
    if (this.pingAccumulator < 1) return;
    this.pingAccumulator %= 1;
    const nonce = createLanId("ping");
    const sentAt = performance.now();
    this.pendingPings.set(nonce, sentAt);
    const oldest = this.pendingPings.keys().next().value;
    if (this.pendingPings.size > 4 && typeof oldest === "string") this.pendingPings.delete(oldest);
    this.sendReliable({ type: "ping", nonce, sentAt });
  }

  close(reason = "client_closed", notify = true): void {
    if (this.closed) return;
    this.closed = true;
    if (notify) this.sendReliable({ type: "leave" });
    if (this.peer) closePeer(this.peer, this.channels || undefined);
    this.connected = false;
    this.joined = false;
    this.peer = null;
    this.channels = null;
    this.self = null;
    this.room = null;
    this.users = [];
    this.emit("room_left", {});
    this.emit("status", { connected: false, code: reason === "host_closed" ? "LAN_HOST_CLOSED" : "LAN_DISCONNECTED" });
    this.emitDebug();
  }

  private bindPeer(peer: RTCPeerConnection): void {
    const update = () => this.emitDebug();
    peer.addEventListener("connectionstatechange", () => {
      update();
      if (peer.connectionState === "failed" || peer.connectionState === "closed") this.close("host_closed", false);
    });
    peer.addEventListener("iceconnectionstatechange", update);
  }

  private bindChannels(channels: LanDataChannels): void {
    const update = () => {
      this.emitDebug();
      this.joinIfReady();
    };
    for (const channel of [channels.state, channels.reliable]) {
      channel.addEventListener("open", update);
      channel.addEventListener("close", () => {
        update();
        if (!this.closed && channel === channels.reliable) this.close("host_closed", false);
      });
      channel.addEventListener("error", update);
    }
    channels.state.addEventListener("message", event => this.receiveState(event.data));
    channels.reliable.addEventListener("message", event => this.receiveReliable(event.data));
    update();
  }

  private joinIfReady(): void {
    if (this.joined || this.closed || this.channels?.state.readyState !== "open" || this.channels.reliable.readyState !== "open") return;
    this.joined = true;
    this.sendReliable({ type: "join", profile: this.profile });
    this.emit("status", { connected: true, code: "LAN_REGISTERING" });
  }

  private receiveState(raw: unknown): void {
    const message = decodeWireMessage(raw);
    if (message?.type !== "snapshot" || message.seq <= this.lastSnapshotSequence) return;
    this.lastSnapshotSequence = message.seq;
    this.emit("snapshot", message.snapshot);
  }

  private receiveReliable(raw: unknown): void {
    const message = decodeWireMessage(raw);
    if (!message) return;
    if (message.type === "joined") {
      this.self = message.self;
      this.room = message.room;
      this.users = message.room.members.map(member => ({ ...member }));
      this.connected = true;
      this.emit("registered", { self: this.self });
      this.emit("room_state", this.room);
      this.emit("status", { connected: true, code: "LAN_CONNECTED" });
    }
    if (message.type === "room_state") {
      this.room = message.room;
      this.users = message.room.members.map(member => ({ ...member }));
      this.emit("room_state", message.room);
    }
    if (message.type === "match_start") this.emit("match_start", message.payload);
    if (message.type === "combat_event") this.emit("combat_event", message.event);
    if (message.type === "vitals") this.emit("vitals", message);
    if (message.type === "match_end") this.emit("match_end", message.result);
    if (message.type === "error") this.emit("error", { code: message.code, message: message.message });
    if (message.type === "host_closed") this.close("host_closed", false);
    if (message.type === "ping") this.sendReliable({ type: "pong", nonce: message.nonce, sentAt: message.sentAt });
    if (message.type === "pong") {
      const startedAt = this.pendingPings.get(message.nonce);
      if (startedAt != null) {
        this.pendingPings.delete(message.nonce);
        this.rttMs = Math.max(0, performance.now() - startedAt);
        this.emitDebug();
      }
    }
  }

  private sendReliable(message: LanReliableMessage): boolean {
    return sendChannel(this.channels?.reliable, encodeWireMessage(message));
  }

  private emitDebug(): void {
    this.emit("debug", { role: this.role, peers: this.debugPeers });
  }
}
