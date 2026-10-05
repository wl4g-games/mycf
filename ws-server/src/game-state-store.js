const STATE_SCHEMA_VERSION = 1;
const DEFAULT_ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RECOVERY_TTL_MS = 60 * 60 * 1000;
const DEFAULT_RESULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function keyPart(value) {
  return encodeURIComponent(String(value || ""));
}

function publicMember(client) {
  if (!client) return null;
  return {
    id: client.id,
    alias: client.alias,
    roomId: client.roomId,
    loadoutId: client.loadoutId,
    characterId: client.characterId,
  };
}

export class GameStateStore {
  constructor(cache, {
    roomTtlMs = DEFAULT_ROOM_TTL_MS,
    recoveryTtlMs = DEFAULT_RECOVERY_TTL_MS,
    resultTtlMs = DEFAULT_RESULT_TTL_MS,
    now = () => Date.now(),
  } = {}) {
    if (!cache) throw new Error("GameStateStore requires a cache backend.");
    this.cache = cache;
    this.roomTtlMs = roomTtlMs;
    this.recoveryTtlMs = recoveryTtlMs;
    this.resultTtlMs = resultTtlMs;
    this.now = now;
  }

  roomKey(roomId) { return `state:room:${keyPart(roomId)}`; }
  resultKey(matchId) { return `state:result:${keyPart(matchId)}`; }
  latestResultKey(roomId) { return `state:latest-result:${keyPart(roomId)}`; }
  recoveryPrefix(roomId) { return `state:recovery:${keyPart(roomId)}:`; }
  recoveryKey(roomId, matchId = "waiting") { return `${this.recoveryPrefix(roomId)}${keyPart(matchId)}`; }

  roomDocument(room, clients) {
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      id: room.id,
      ownerId: room.ownerId,
      mapId: room.mapId,
      modeId: room.modeId,
      conditionId: room.conditionId,
      killTarget: room.killTarget,
      timeLimit: room.timeLimit,
      status: room.status,
      matchId: room.matchId || null,
      members: room.members.map(id => publicMember(clients.get(id))).filter(Boolean),
      invited: [...room.invited],
      match: room.match?.exportState?.() || null,
      createdAt: room.createdAt,
      updatedAt: this.now(),
    };
  }

  async saveRoom(room, clients) {
    const document = this.roomDocument(room, clients);
    await this.saveRoomDocument(document);
    return document;
  }

  async saveRoomDocument(document) {
    await this.cache.set(this.roomKey(document.id), document, { ttlMs: this.roomTtlMs });
  }

  async loadRoom(roomId) {
    return this.cache.get(this.roomKey(roomId));
  }

  async listRooms() {
    const entries = await this.cache.scan("state:room:");
    return entries.map(entry => entry.value);
  }

  async deleteRoom(roomId) {
    return this.cache.delete(this.roomKey(roomId));
  }

  recoveryDocument(room, clients, reason = "connection_lost") {
    return {
      ...this.roomDocument(room, clients),
      recovery: { reason, capturedAt: this.now() },
    };
  }

  async saveRecoveryDocument(document) {
    const key = this.recoveryKey(document.id, document.matchId || "waiting");
    const options = { ttlMs: this.recoveryTtlMs };
    if (!document.matchId || document.recovery?.reason === "server_shutdown") {
      await this.cache.set(key, document, options);
      return true;
    }
    return this.cache.setIfAbsent(key, document, options);
  }

  async loadRecovery(roomId, matchId) {
    if (matchId !== undefined && matchId !== null) {
      return this.cache.get(this.recoveryKey(roomId, matchId || "waiting"));
    }
    const entries = await this.cache.scan(this.recoveryPrefix(roomId));
    return entries
      .map(entry => entry.value)
      .sort((left, right) => Number(right.recovery?.capturedAt || 0) - Number(left.recovery?.capturedAt || 0))[0]
      || null;
  }

  resultDocument(room, result, matchId = room.matchId) {
    if (!matchId) throw new Error("A match id is required to persist a result.");
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      id: matchId,
      roomId: room.id,
      mapId: room.mapId,
      modeId: room.modeId,
      conditionId: room.conditionId,
      result,
      finishedAt: this.now(),
    };
  }

  async saveResultDocument(document) {
    await this.cache.set(this.resultKey(document.id), document, { ttlMs: this.resultTtlMs });
  }

  async saveLatestResultDocument(document) {
    await this.cache.set(this.latestResultKey(document.roomId), document, { ttlMs: this.resultTtlMs });
  }

  async saveResult(room, result, matchId = room.matchId) {
    const document = this.resultDocument(room, result, matchId);
    await this.saveResultDocument(document);
    await this.saveLatestResultDocument(document);
    return document;
  }

  async loadResult(matchId) {
    return this.cache.get(this.resultKey(matchId));
  }

  async loadLatestResult(roomId) {
    return this.cache.get(this.latestResultKey(roomId));
  }
}

export { STATE_SCHEMA_VERSION };
