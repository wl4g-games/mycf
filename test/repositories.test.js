import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GAME_SETUP,
  GAME_SETUP_STORAGE_KEY,
  IGameSetupRepository,
  LocalGameSetupRepository,
  normalizeGameSetup,
} from "../src/repositories/game-setup-repository.js";
import {
  DEFAULT_PARENTAL_CONTROL_STATE,
  IParentalControlRepository,
  LocalParentalControlRepository,
  PARENTAL_CONTROL_STORAGE_KEY,
  normalizeParentalControlState,
} from "../src/repositories/parental-control-repository.js";
import {
  DEFAULT_ROOM_STATE,
  IRoomStateRepository,
  LocalRoomStateRepository,
} from "../src/repositories/room-state-repository.js";

class MemoryStorage {
  constructor(entries = []) { this.values = new Map(entries); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

class StorageEventTarget {
  constructor() { this.listeners = new Set(); }
  addEventListener(type, listener) { if (type === "storage") this.listeners.add(listener); }
  removeEventListener(type, listener) { if (type === "storage") this.listeners.delete(listener); }
  dispatch(event) { for (const listener of [...this.listeners]) listener(event); }
}

test("game setup repository validates every persisted deployment choice", () => {
  assert.deepEqual(normalizeGameSetup({
    versionId: "network",
    mapId: "wild",
    modeId: "16v16",
    loadoutId: "archer",
    characterId: "cuteSoldier",
    conditionId: "marathon",
    alias: "  Agent   Seven  ",
  }), {
    versionId: "network",
    mapId: "wild",
    modeId: "16v16",
    loadoutId: "archer",
    characterId: "cuteSoldier",
    conditionId: "marathon",
    alias: "Agent Seven",
  });

  assert.deepEqual(normalizeGameSetup({
    versionId: "invalid",
    mapId: "invalid",
    modeId: "32v32",
    loadoutId: "invalid",
    characterId: "invalid",
    conditionId: "invalid",
    alias: "!",
  }), DEFAULT_GAME_SETUP);
});

test("local game setup repository persists detached snapshots and clears safely", () => {
  const storage = new MemoryStorage();
  const repository = new LocalGameSetupRepository({ storage, eventTarget: null });
  const saved = repository.save({ ...DEFAULT_GAME_SETUP, mapId: "wild", modeId: "1v1" });
  saved.mapId = "city";

  assert.equal(repository.load().mapId, "wild");
  assert.equal(JSON.parse(storage.getItem(GAME_SETUP_STORAGE_KEY)).modeId, "1v1");
  assert.deepEqual(repository.clear(), DEFAULT_GAME_SETUP);
  assert.equal(storage.getItem(GAME_SETUP_STORAGE_KEY), null);
});

test("parental repository preserves the active cycle duration independently from new settings", () => {
  const state = normalizeParentalControlState({
    version: 99,
    settings: { enabled: true, durationMinutes: 20, questionsToUnlock: 10 },
    cycle: { id: 8, durationMinutes: 3, remainingSeconds: 71.5, locked: false },
  });

  assert.deepEqual(state, {
    version: 1,
    settings: { enabled: true, durationMinutes: 20, questionsToUnlock: 10 },
    cycle: { id: 8, durationMinutes: 3, remainingSeconds: 71.5, locked: false },
  });
  assert.equal(normalizeParentalControlState({
    settings: { enabled: false, durationMinutes: 5, questionsToUnlock: 3 },
    cycle: { durationMinutes: 5, remainingSeconds: 0 },
  }).cycle.locked, true);
});

test("malformed parental data falls back to the safe normalized defaults", () => {
  assert.equal(DEFAULT_PARENTAL_CONTROL_STATE.settings.enabled, false);
  const storage = new MemoryStorage([[PARENTAL_CONTROL_STORAGE_KEY, "not-json"]]);
  const repository = new LocalParentalControlRepository({ storage, eventTarget: null });
  assert.deepEqual(repository.load(), DEFAULT_PARENTAL_CONTROL_STATE);

  assert.deepEqual(repository.save({
    settings: { enabled: "no", durationMinutes: 2, questionsToUnlock: 2 },
    cycle: { id: -4, durationMinutes: -1, remainingSeconds: -1, locked: "yes" },
  }), DEFAULT_PARENTAL_CONTROL_STATE);
});

test("browser storage failures degrade to a session-local repository", () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error("quota exceeded"); },
    removeItem() { throw new Error("unavailable"); },
  };
  const repository = new LocalParentalControlRepository({ storage, eventTarget: null });
  const next = {
    version: 1,
    settings: { enabled: false, durationMinutes: 10, questionsToUnlock: 5 },
    cycle: { id: 3, durationMinutes: 3, remainingSeconds: 12, locked: false },
  };
  repository.save(next, { intent: "replace" });
  assert.deepEqual(repository.load(), next);
  assert.deepEqual(repository.clear(), DEFAULT_PARENTAL_CONTROL_STATE);
});

test("local repositories notify same-tab and cross-tab subscribers", () => {
  const storage = new MemoryStorage();
  const events = new StorageEventTarget();
  const writer = new LocalParentalControlRepository({ storage, eventTarget: events });
  const reader = new LocalParentalControlRepository({ storage, eventTarget: events });
  const received = [];
  const unsubscribe = reader.subscribe(state => received.push(state));

  const state = writer.save({
    version: 1,
    settings: { enabled: true, durationMinutes: 1, questionsToUnlock: 3 },
    cycle: { id: 1, durationMinutes: 1, remainingSeconds: 45, locked: false },
  }, { intent: "replace" });
  events.dispatch({
    key: PARENTAL_CONTROL_STORAGE_KEY,
    newValue: storage.getItem(PARENTAL_CONTROL_STORAGE_KEY),
    storageArea: storage,
  });
  assert.deepEqual(received, [state]);

  reader.save({ ...state, cycle: { ...state.cycle, remainingSeconds: 30 } });
  assert.equal(received.at(-1).cycle.remainingSeconds, 30);
  unsubscribe();
  assert.equal(events.listeners.size, 0);
});

test("room state repository is detached, subscribable, and deliberately memory-only", () => {
  const repository = new LocalRoomStateRepository();
  const updates = [];
  repository.subscribe(state => updates.push(state));
  const room = { id: "ABC123", members: [{ id: "user-1", alias: "Alpha" }] };
  const snapshot = repository.save({
    connected: true,
    self: { id: "user-1", alias: "Alpha" },
    users: [{ id: "user-1", available: false }, null, "invalid"],
    room,
  });

  room.members[0].alias = "Mutated";
  snapshot.self.alias = "Mutated";
  assert.equal(repository.load().room.members[0].alias, "Alpha");
  assert.equal(repository.load().self.alias, "Alpha");
  assert.deepEqual(repository.load().users, [{ id: "user-1", available: false }]);
  assert.equal(updates.length, 1);
  assert.deepEqual(repository.clear(), DEFAULT_ROOM_STATE);
});

test("repository interfaces fail explicitly until an implementation is supplied", () => {
  const interfaces = [new IGameSetupRepository(), new IParentalControlRepository(), new IRoomStateRepository()];
  for (const repository of interfaces) {
    assert.throws(() => repository.load(), /not implemented/);
    assert.throws(() => repository.save({}), /not implemented/);
    if (repository instanceof IParentalControlRepository) {
      assert.throws(() => repository.advanceCycle({}, 0), /not implemented/);
    }
    assert.throws(() => repository.clear(), /not implemented/);
    assert.throws(() => repository.subscribe(() => {}), /not implemented/);
  }
});
