import { cloneDocument } from "./local-json-repository.js";

export const DEFAULT_ROOM_STATE = Object.freeze({
  connected: false,
  self: null,
  users: Object.freeze([]),
  room: null,
});

const isRecord = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const recordOrNull = value => isRecord(value) ? cloneDocument(value) : null;

export function normalizeRoomState(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    connected: source.connected === true,
    self: recordOrNull(source.self),
    users: Array.isArray(source.users) ? cloneDocument(source.users.filter(isRecord)) : [],
    room: recordOrNull(source.room),
  };
}

export class IRoomStateRepository {
  load() { throw new Error("IRoomStateRepository.load() is not implemented."); }
  save(_state) { throw new Error("IRoomStateRepository.save() is not implemented."); }
  clear() { throw new Error("IRoomStateRepository.clear() is not implemented."); }
  subscribe(_listener) { throw new Error("IRoomStateRepository.subscribe() is not implemented."); }
}

/**
 * Stores only the client-side projection of the authoritative WebSocket room.
 * Deliberately in-memory: persisting room membership would resurrect stale
 * ownership and invitations after the server has already changed them.
 */
export class LocalRoomStateRepository extends IRoomStateRepository {
  constructor(initialState = DEFAULT_ROOM_STATE) {
    super();
    this.state = normalizeRoomState(initialState);
    this.listeners = new Set();
  }

  load() { return cloneDocument(this.state); }

  save(state) {
    this.state = normalizeRoomState(state);
    const snapshot = this.load();
    for (const listener of [...this.listeners]) listener(cloneDocument(snapshot));
    return snapshot;
  }

  clear() { return this.save(DEFAULT_ROOM_STATE); }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("A repository listener must be a function.");
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
