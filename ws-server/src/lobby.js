import { randomUUID } from "node:crypto";
import { DEFAULT_CHARACTER_ID, GAME_MODES, LOADOUTS, MAPS, resolveCharacterId, resolveMatchCondition } from "./game-config.js";
import { AuthoritativeMatch } from "./match.js";
import { PersistenceQueue } from "./persistence-queue.js";

const ALIAS_PATTERN = /^[\p{L}\p{N}_\-\s]{2,16}$/u;
const socketOpen = socket => socket?.readyState === 1;

function roomCode() {
  return randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
}

export class LobbyService {
  constructor({
    stateStore = null,
    persistenceIntervalSeconds = 1,
    persistenceRetryAttempts = 3,
    persistenceRetryBaseDelayMs = 50,
    onPersistenceError = () => {},
  } = {}) {
    this.clients = new Map();
    this.rooms = new Map();
    this.stateStore = stateStore;
    this.persistenceIntervalSeconds = persistenceIntervalSeconds;
    this.persistenceQueue = new PersistenceQueue({
      retryAttempts: persistenceRetryAttempts,
      retryBaseDelayMs: persistenceRetryBaseDelayMs,
      isBackendReady: () => this.stateStore?.cache?.isReady !== false,
      onError: onPersistenceError,
    });
    this.connectionRecoveryKeys = new WeakMap();
    this.lastTick = performance.now();
    this.snapshotAccumulator = 0;
    this.persistenceAccumulator = 0;
    this.shuttingDown = false;
  }

  trackPersistence(key, operation) {
    this.persistenceQueue.schedule(key, operation);
  }

  retryFailedPersistence() {
    if (!this.shuttingDown) this.persistenceQueue.retryFailed();
  }

  recordPersistenceError(key, error) {
    this.persistenceQueue.recordError(key, error);
  }

  get lastPersistenceError() { return this.persistenceQueue.lastError; }

  capturePersistenceDocument(key, createDocument) {
    try {
      return createDocument();
    } catch (error) {
      this.recordPersistenceError(key, error);
      return null;
    }
  }

  persistRoom(room) {
    if (!room || !this.stateStore) return;
    const key = `room:${room.id}`;
    const document = this.capturePersistenceDocument(
      key,
      () => this.stateStore.roomDocument(room, this.clients),
    );
    if (document) this.trackPersistence(key, () => this.stateStore.saveRoomDocument(document));
  }

  archiveRoom(room, reason) {
    if (!room || !this.stateStore) return;
    const recoveryId = room.matchId || "waiting";
    const key = `recovery:${room.id}:${recoveryId}`;
    const scheduled = this.connectionRecoveryKeys.get(room);
    const preserveFirstMatchSnapshot = reason === "connection_lost" && Boolean(room.matchId);
    if (preserveFirstMatchSnapshot && scheduled?.has(recoveryId)) return;
    const document = this.capturePersistenceDocument(
      key,
      () => this.stateStore.recoveryDocument(room, this.clients, reason),
    );
    if (!document) return;
    if (preserveFirstMatchSnapshot) {
      const recoveryKeys = scheduled || new Set();
      recoveryKeys.add(recoveryId);
      if (!scheduled) this.connectionRecoveryKeys.set(room, recoveryKeys);
    }
    this.trackPersistence(key, () => this.stateStore.saveRecoveryDocument(document));
  }

  beginShutdown() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    for (const room of this.rooms.values()) this.archiveRoom(room, "server_shutdown");
  }

  deletePersistedRoom(roomId) {
    if (roomId && this.stateStore) {
      this.trackPersistence(`room:${roomId}`, () => this.stateStore.deleteRoom(roomId));
    }
  }

  async flushPersistence() {
    await this.persistenceQueue.flush();
  }

  connect(socket, request = {}) {
    const id = randomUUID();
    const client = {
      id,
      socket,
      alias: null,
      roomId: null,
      loadoutId: "recon",
      characterId: DEFAULT_CHARACTER_ID,
      messages: 0,
      messageWindow: Date.now(),
      ip: String(request.headers?.["x-forwarded-for"] || request.socket?.remoteAddress || "unknown").split(",")[0].trim(),
    };
    this.clients.set(id, client);
    socket.on("message", data => this.receive(client, data));
    socket.on("close", () => this.disconnect(client));
    socket.on("error", () => this.disconnect(client));
    this.send(client, "hello", { protocol: 1, clientId: id });
    return client;
  }

  receive(client, raw) {
    if (this.shuttingDown) return;
    const now = Date.now();
    if (now - client.messageWindow > 1000) {
      client.messageWindow = now;
      client.messages = 0;
    }
    client.messages += 1;
    if (client.messages > 80) return this.error(client, "RATE_LIMIT", "Too many requests. Try again shortly.");
    if (raw.length > 16384) return client.socket.close(1009, "message too large");
    let message;
    try { message = JSON.parse(raw.toString()); } catch (error) { return this.error(client, "BAD_JSON", "The message payload is not valid JSON."); }
    if (!message || typeof message.type !== "string") return this.error(client, "BAD_MESSAGE", "The message type is missing.");
    const payload = message.payload || {};
    if (message.type !== "register" && !client.alias) return this.error(client, "NOT_REGISTERED", "Register a callsign first.");
    const handlers = {
      register: () => this.register(client, payload),
      update_profile: () => this.updateProfile(client, payload),
      create_room: () => this.createRoom(client, payload),
      invite: () => this.invite(client, payload),
      respond_invite: () => this.respondInvite(client, payload),
      leave_room: () => this.leaveRoom(client),
      start_room: () => this.startRoom(client),
      match_input: () => this.matchInput(client, payload),
      ping: () => this.send(client, "pong", { now: Date.now() }),
    };
    const handler = handlers[message.type];
    if (!handler) return this.error(client, "UNKNOWN_TYPE", "This message type is not supported.");
    handler();
  }

  register(client, payload) {
    if (client.alias) return this.error(client, "ALREADY_REGISTERED", "This connection is already registered.");
    const alias = String(payload.alias || "").trim().replace(/\s+/g, " ");
    if (!ALIAS_PATTERN.test(alias)) return this.error(client, "BAD_ALIAS", "Use 2–16 letters, numbers, spaces, underscores, or hyphens.");
    const exists = [...this.clients.values()].some(item => item !== client && item.alias && item.alias.toLocaleLowerCase() === alias.toLocaleLowerCase());
    if (exists) return this.error(client, "ALIAS_TAKEN", "That callsign is already online. Choose another one.");
    client.alias = alias;
    client.loadoutId = LOADOUTS[payload.loadoutId] ? payload.loadoutId : "recon";
    client.characterId = resolveCharacterId(payload.characterId);
    this.send(client, "registered", { self: this.publicUser(client) });
    this.broadcastPresence();
  }

  updateProfile(client, payload) {
    if (LOADOUTS[payload.loadoutId]) client.loadoutId = payload.loadoutId;
    client.characterId = resolveCharacterId(payload.characterId || client.characterId);
    const room = this.rooms.get(client.roomId);
    if (room?.status === "waiting") {
      this.broadcastRoom(room);
      this.persistRoom(room);
    }
  }

  createRoom(client, payload) {
    if (client.roomId) return this.error(client, "IN_ROOM", "Leave the current room first.");
    const mapId = MAPS[payload.mapId] ? payload.mapId : "city";
    const modeId = GAME_MODES[payload.modeId] ? payload.modeId : "4v4";
    const rules = resolveMatchCondition(payload);
    let id = roomCode();
    while (this.rooms.has(id)) id = roomCode();
    const room = {
      id,
      ownerId: client.id,
      mapId,
      modeId,
      conditionId: rules.id,
      killTarget: rules.killTarget,
      timeLimit: rules.timeLimit,
      status: "waiting",
      members: [client.id],
      invited: new Set(),
      match: null,
      matchId: null,
      createdAt: Date.now(),
    };
    this.rooms.set(id, room);
    client.roomId = id;
    this.broadcastRoom(room);
    this.broadcastPresence();
    this.persistRoom(room);
  }

  invite(client, payload) {
    const room = this.rooms.get(client.roomId);
    if (!room || room.ownerId !== client.id || room.status !== "waiting") return this.error(client, "NOT_OWNER", "Only the owner of a waiting room can invite players.");
    const target = this.clients.get(String(payload.targetId || ""));
    if (!target?.alias || target.roomId) return this.error(client, "TARGET_BUSY", "That player is offline or already in another room.");
    if (room.members.length >= this.maxHumans(room)) return this.error(client, "ROOM_FULL", "All human slots in this room are occupied.");
    room.invited.add(target.id);
    this.send(target, "invite", { room: this.publicRoom(room), from: this.publicUser(client) });
    this.send(client, "notice", { code: "INVITE_SENT", params: { alias: target.alias } });
    this.persistRoom(room);
  }

  respondInvite(client, payload) {
    const room = this.rooms.get(String(payload.roomId || ""));
    if (!room || !room.invited.has(client.id)) return this.error(client, "INVITE_EXPIRED", "This invitation has expired.");
    room.invited.delete(client.id);
    if (!payload.accept) {
      this.send(client, "notice", { code: "INVITE_DECLINED" });
      this.persistRoom(room);
      return;
    }
    if (client.roomId || room.status !== "waiting" || room.members.length >= this.maxHumans(room)) return this.error(client, "ROOM_UNAVAILABLE", "This room has started or is full.");
    client.roomId = room.id;
    room.members.push(client.id);
    this.broadcastRoom(room);
    this.broadcastPresence();
    this.persistRoom(room);
  }

  leaveRoom(client) {
    const room = this.rooms.get(client.roomId);
    if (!room) { client.roomId = null; return; }
    if (room.match) room.match.removeHuman(client.id);
    room.members = room.members.filter(id => id !== client.id);
    client.roomId = null;
    if (!room.members.length) {
      this.rooms.delete(room.id);
      this.deletePersistedRoom(room.id);
    }
    else {
      if (room.ownerId === client.id) room.ownerId = room.members[0];
      this.broadcastRoom(room);
      this.persistRoom(room);
    }
    this.send(client, "room_left", {});
    this.broadcastPresence();
  }

  startRoom(client) {
    const room = this.rooms.get(client.roomId);
    if (!room || room.ownerId !== client.id || room.status !== "waiting") return this.error(client, "NOT_OWNER", "Only the owner of a waiting room can start the match.");
    const members = room.members.map(id => this.clients.get(id)).filter(Boolean);
    if (!members.length) return this.error(client, "EMPTY_ROOM", "No online players remain in this room.");
    room.status = "playing";
    room.matchId = randomUUID();
    room.match = new AuthoritativeMatch(
      room,
      members,
      event => {
        this.broadcastToRoom(room, "combat_event", event);
        if (event.type === "kill") this.persistRoom(room);
      },
      result => this.finishMatch(room, result),
    );
    members.forEach(member => this.send(member, "match_start", {
      room: this.publicRoom(room),
      assignment: room.match.assignmentFor(member.id),
      duration: room.match.rules.timeLimit,
      endsAt: room.match.endsAt,
    }));
    this.broadcastRoom(room);
    this.broadcastPresence();
    this.persistRoom(room);
  }

  matchInput(client, payload) {
    const room = this.rooms.get(client.roomId);
    if (room?.status === "playing" && room.match) room.match.setInput(client.id, payload);
  }

  tick() {
    const now = performance.now();
    const dt = Math.min(.1, Math.max(.001, (now - this.lastTick) / 1000));
    this.lastTick = now;
    this.snapshotAccumulator += dt;
    this.persistenceAccumulator += dt;
    for (const room of this.rooms.values()) if (room.match) room.match.update(dt);
    if (this.persistenceAccumulator >= this.persistenceIntervalSeconds) {
      this.persistenceAccumulator = 0;
      for (const room of this.rooms.values()) if (room.match) this.persistRoom(room);
      this.retryFailedPersistence();
    }
    if (this.snapshotAccumulator < .066) return;
    this.snapshotAccumulator = 0;
    for (const room of this.rooms.values()) {
      if (!room.match) continue;
      for (const memberId of room.members) {
        const member = this.clients.get(memberId);
        if (member) this.send(member, "snapshot", room.match.snapshotFor(member.id));
      }
    }
  }

  finishMatch(room, result) {
    this.broadcastToRoom(room, "match_end", result);
    if (this.stateStore && room.matchId) {
      const matchId = room.matchId;
      const key = `result:${matchId}`;
      const document = this.capturePersistenceDocument(
        key,
        () => this.stateStore.resultDocument(room, result, matchId),
      );
      if (document) {
        this.trackPersistence(key, () => this.stateStore.saveResultDocument(document));
        this.trackPersistence(
          `latest-result:${room.id}`,
          () => this.stateStore.saveLatestResultDocument(document),
        );
      }
    }
    room.match = null;
    room.status = "waiting";
    room.matchId = null;
    this.broadcastRoom(room);
    this.broadcastPresence();
    this.persistRoom(room);
  }

  disconnect(client) {
    if (!this.clients.has(client.id)) return;
    const room = this.rooms.get(client.roomId);
    if (room && !this.shuttingDown) this.archiveRoom(room, "connection_lost");
    if (room?.match) room.match.removeHuman(client.id);
    if (room) {
      room.members = room.members.filter(id => id !== client.id);
      if (!room.members.length) {
        this.rooms.delete(room.id);
        this.deletePersistedRoom(room.id);
      }
      else {
        if (room.ownerId === client.id) room.ownerId = room.members[0];
        this.broadcastRoom(room);
        this.persistRoom(room);
      }
    }
    this.clients.delete(client.id);
    this.broadcastPresence();
  }

  maxHumans(room) {
    return (GAME_MODES[room.modeId] || GAME_MODES["4v4"]).teamSize * 2;
  }

  publicUser(client) {
    return {
      id: client.id,
      alias: client.alias,
      roomId: client.roomId,
      available: Boolean(client.alias && !client.roomId),
      loadoutId: client.loadoutId,
      characterId: client.characterId,
    };
  }

  publicRoom(room) {
    return {
      id: room.id,
      ownerId: room.ownerId,
      mapId: room.mapId,
      modeId: room.modeId,
      conditionId: room.conditionId,
      killTarget: room.killTarget,
      timeLimit: room.timeLimit,
      status: room.status,
      matchId: room.matchId,
      maxHumans: this.maxHumans(room),
      members: room.members.map(id => this.clients.get(id)).filter(Boolean).map(client => this.publicUser(client)),
    };
  }

  broadcastPresence() {
    const users = [...this.clients.values()].filter(client => client.alias).map(client => this.publicUser(client));
    for (const client of this.clients.values()) if (client.alias) this.send(client, "presence", { users });
  }

  broadcastRoom(room) { this.broadcastToRoom(room, "room_state", { room: this.publicRoom(room) }); }

  broadcastToRoom(room, type, payload) {
    for (const memberId of room.members) {
      const client = this.clients.get(memberId);
      if (client) this.send(client, type, payload);
    }
  }

  send(client, type, payload) {
    if (client && socketOpen(client.socket)) client.socket.send(JSON.stringify({ type, payload }));
  }

  error(client, code, message) { this.send(client, "error", { code, message }); }
}
