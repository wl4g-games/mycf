import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { MemoryCache } from "../src/cache/memory-cache.js";
import { GameStateStore } from "../src/game-state-store.js";
import { LobbyService } from "../src/lobby.js";

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.outbox = [];
  }

  send(raw) { this.outbox.push(JSON.parse(raw)); }

  receive(type, payload = {}) {
    this.emit("message", Buffer.from(JSON.stringify({ type, payload })));
  }

  take(type) {
    const index = this.outbox.findIndex(message => message.type === type);
    return index < 0 ? null : this.outbox.splice(index, 1)[0].payload;
  }
}

test("lobby persistence stores versioned room checkpoints and completed rankings", async t => {
  const cache = new MemoryCache();
  await cache.connect();
  t.after(() => cache.close());
  const stateStore = new GameStateStore(cache);
  const lobby = new LobbyService({ stateStore });
  const socket = new FakeSocket();
  const client = lobby.connect(socket, {});

  socket.receive("register", { alias: "Keeper", loadoutId: "recon", characterId: "specialForces" });
  assert.ok(socket.take("registered"));
  socket.receive("create_room", { mapId: "wild", modeId: "1v1", conditionId: "blitz" });
  const created = socket.take("room_state").room;
  socket.receive("start_room");
  assert.ok(socket.take("match_start"));
  const room = lobby.rooms.get(created.id);
  const matchId = room.matchId;
  const actor = room.match.actorByUser.get(client.id);
  actor.kills = 6;
  actor.deaths = 2;
  actor.damage = 910;
  room.match.score.seal = 6;
  lobby.persistRoom(room);
  await lobby.flushPersistence();

  const checkpoint = await stateStore.loadRoom(room.id);
  assert.equal(checkpoint.schemaVersion, 1);
  assert.equal(checkpoint.matchId, matchId);
  assert.equal(checkpoint.members[0].alias, "Keeper");
  assert.deepEqual(
    checkpoint.match.actors
      .filter(item => item.userId === client.id)
      .map(item => ({ kills: item.kills, deaths: item.deaths, damage: item.damage })),
    [{ kills: 6, deaths: 2, damage: 910 }],
  );

  room.match.finish("seal");
  await lobby.flushPersistence();
  const storedResult = await stateStore.loadResult(matchId);
  const ranking = storedResult.result.rankings.find(entry => entry.userId === client.id);
  assert.deepEqual(
    { kills: ranking.kills, deaths: ranking.deaths, damage: ranking.damage },
    { kills: 6, deaths: 2, damage: 910 },
  );
  assert.equal((await stateStore.loadRoom(room.id)).status, "waiting");
  assert.equal((await stateStore.loadLatestResult(room.id)).id, matchId);
});

test("ordered persistence prevents a late room save from resurrecting a deleted room", async t => {
  const cache = new MemoryCache();
  await cache.connect();
  t.after(() => cache.close());
  const stateStore = new GameStateStore(cache);
  const lobby = new LobbyService({ stateStore });
  const socket = new FakeSocket();
  lobby.connect(socket, {});

  socket.receive("register", { alias: "Owner", loadoutId: "police" });
  socket.take("registered");
  socket.receive("create_room", { mapId: "city", modeId: "4v4", conditionId: "standard" });
  const roomId = socket.take("room_state").room.id;
  socket.receive("leave_room");
  await lobby.flushPersistence();

  assert.equal(await stateStore.loadRoom(roomId), null);
  assert.deepEqual(await stateStore.listRooms(), []);
});

test("one-shot room deletion retries transient failures before flush succeeds", async t => {
  const cache = new MemoryCache();
  await cache.connect();
  t.after(() => cache.close());
  class FlakyDeleteStore extends GameStateStore {
    deleteAttempts = 0;

    async deleteRoom(roomId) {
      this.deleteAttempts += 1;
      if (this.deleteAttempts < 3) throw new Error("temporary delete failure");
      return super.deleteRoom(roomId);
    }
  }
  const stateStore = new FlakyDeleteStore(cache);
  const lobby = new LobbyService({
    stateStore,
    persistenceRetryAttempts: 3,
    persistenceRetryBaseDelayMs: 1,
  });
  const socket = new FakeSocket();
  lobby.connect(socket, {});
  socket.receive("register", { alias: "RetryOwner" });
  socket.take("registered");
  socket.receive("create_room", { mapId: "city", modeId: "1v1", conditionId: "standard" });
  const roomId = socket.take("room_state").room.id;
  socket.receive("leave_room");

  await lobby.flushPersistence();
  assert.equal(stateStore.deleteAttempts, 3);
  assert.equal(lobby.lastPersistenceError, null);
  assert.equal(await stateStore.loadRoom(roomId), null);
});

test("flush rejects after a one-shot operation exhausts bounded retries", async () => {
  const lobby = new LobbyService({
    persistenceRetryAttempts: 2,
    persistenceRetryBaseDelayMs: 1,
  });
  let attempts = 0;
  lobby.trackPersistence("result:terminal", async () => {
    attempts += 1;
    throw new Error("result storage unavailable");
  });

  await assert.rejects(
    lobby.flushPersistence(),
    error => error instanceof AggregateError && error.errors.some(item => /storage unavailable/.test(item.message)),
  );
  assert.equal(attempts, 2);
  assert.match(lobby.lastPersistenceError.message, /storage unavailable/);
});

test("an exhausted one-shot operation is retained and retried after backend recovery", async () => {
  const backend = { isReady: false };
  const lobby = new LobbyService({
    stateStore: { cache: backend },
    persistenceRetryAttempts: 1,
  });
  let attempts = 0;
  lobby.trackPersistence("result:recoverable", async () => {
    attempts += 1;
    if (!backend.isReady) throw new Error("backend offline");
  });
  await assert.rejects(lobby.flushPersistence(), AggregateError);
  lobby.retryFailedPersistence();
  assert.equal(attempts, 1);

  backend.isReady = true;
  lobby.retryFailedPersistence();
  await lobby.flushPersistence();
  assert.equal(attempts, 2);
  assert.equal(lobby.lastPersistenceError, null);
});

test("a newer room delete supersedes an older failed save and cannot be resurrected", async t => {
  const cache = new MemoryCache();
  await cache.connect();
  t.after(() => cache.close());
  class StaleSaveStore extends GameStateStore {
    saveAttempts = 0;

    async saveRoomDocument(document) {
      this.saveAttempts += 1;
      throw new Error(`stale save ${document.id}`);
    }
  }
  const stateStore = new StaleSaveStore(cache);
  const lobby = new LobbyService({ stateStore, persistenceRetryAttempts: 1 });
  const document = { id: "STALE", schemaVersion: 1 };
  lobby.trackPersistence("room:STALE", () => stateStore.saveRoomDocument(document));
  await assert.rejects(lobby.flushPersistence(), AggregateError);

  lobby.deletePersistedRoom("STALE");
  await lobby.flushPersistence();
  lobby.retryFailedPersistence();
  await lobby.flushPersistence();
  assert.equal(stateStore.saveAttempts, 1);
  assert.equal(await stateStore.loadRoom("STALE"), null);
});

test("periodic checkpoints include active matches but not unchanged waiting rooms", async t => {
  const cache = new MemoryCache();
  await cache.connect();
  t.after(() => cache.close());
  class CountingStore extends GameStateStore {
    saveCount = 0;

    async saveRoomDocument(document) {
      this.saveCount += 1;
      return super.saveRoomDocument(document);
    }
  }
  const stateStore = new CountingStore(cache);
  const lobby = new LobbyService({ stateStore, persistenceIntervalSeconds: 0 });
  const socket = new FakeSocket();
  lobby.connect(socket, {});
  socket.receive("register", { alias: "CheckpointOwner" });
  socket.take("registered");
  socket.receive("create_room", { mapId: "city", modeId: "1v1", conditionId: "standard" });
  socket.take("room_state");
  await lobby.flushPersistence();
  const waitingSaveCount = stateStore.saveCount;
  lobby.tick();
  await lobby.flushPersistence();
  assert.equal(stateStore.saveCount, waitingSaveCount);

  socket.receive("start_room");
  socket.take("match_start");
  await lobby.flushPersistence();
  const activeSaveCount = stateStore.saveCount;
  lobby.tick();
  await lobby.flushPersistence();
  assert.equal(stateStore.saveCount, activeSaveCount + 1);
});

test("unexpected disconnect archives the last human match state for future recovery", async t => {
  const cache = new MemoryCache();
  await cache.connect();
  t.after(() => cache.close());
  const stateStore = new GameStateStore(cache);
  const lobby = new LobbyService({ stateStore });
  const socket = new FakeSocket();
  const client = lobby.connect(socket, {});

  socket.receive("register", { alias: "Recoverable", loadoutId: "archer" });
  socket.take("registered");
  socket.receive("create_room", { mapId: "city", modeId: "1v1", conditionId: "standard" });
  const roomId = socket.take("room_state").room.id;
  socket.receive("start_room");
  socket.take("match_start");
  const room = lobby.rooms.get(roomId);
  const actor = room.match.actorByUser.get(client.id);
  actor.kills = 3;
  actor.deaths = 1;
  room.match.score.seal = 3;

  socket.emit("close");
  await lobby.flushPersistence();

  assert.equal(await stateStore.loadRoom(roomId), null);
  const recovery = await stateStore.loadRecovery(roomId);
  assert.equal(recovery.recovery.reason, "connection_lost");
  assert.equal(recovery.members[0].id, client.id);
  const recoveredActor = recovery.match.actors.find(item => item.userId === client.id);
  assert.deepEqual(
    { kills: recoveredActor.kills, deaths: recoveredActor.deaths },
    { kills: 3, deaths: 1 },
  );
});

test("sequential disconnects preserve the first complete recovery snapshot", async t => {
  const cache = new MemoryCache();
  await cache.connect();
  t.after(() => cache.close());
  const stateStore = new GameStateStore(cache);
  const lobby = new LobbyService({ stateStore });
  const ownerSocket = new FakeSocket();
  const guestSocket = new FakeSocket();
  const owner = lobby.connect(ownerSocket, {});
  const guest = lobby.connect(guestSocket, {});

  ownerSocket.receive("register", { alias: "FirstOperator" });
  ownerSocket.take("registered");
  guestSocket.receive("register", { alias: "SecondOperator" });
  guestSocket.take("registered");
  ownerSocket.receive("create_room", { mapId: "wild", modeId: "1v1", conditionId: "standard" });
  const roomId = ownerSocket.take("room_state").room.id;
  ownerSocket.receive("invite", { targetId: guest.id });
  assert.ok(guestSocket.take("invite"));
  guestSocket.receive("respond_invite", { roomId, accept: true });
  assert.ok(guestSocket.take("room_state"));
  ownerSocket.receive("start_room");
  assert.ok(ownerSocket.take("match_start"));
  assert.ok(guestSocket.take("match_start"));
  const matchId = lobby.rooms.get(roomId).matchId;

  ownerSocket.emit("close");
  guestSocket.emit("close");
  await lobby.flushPersistence();

  const recovery = await stateStore.loadRecovery(roomId, matchId);
  assert.equal(recovery.recovery.reason, "connection_lost");
  assert.deepEqual(
    recovery.members.map(member => member.id).sort(),
    [owner.id, guest.id].sort(),
  );
  assert.deepEqual(
    recovery.match.actors.filter(actor => actor.userId).map(actor => actor.userId).sort(),
    [owner.id, guest.id].sort(),
  );
});

test("shutdown snapshots cannot be invalidated by buffered lobby messages", async t => {
  const cache = new MemoryCache();
  await cache.connect();
  t.after(() => cache.close());
  const stateStore = new GameStateStore(cache);
  const lobby = new LobbyService({ stateStore });
  const socket = new FakeSocket();
  const client = lobby.connect(socket, {});

  socket.receive("register", { alias: "ClosingOwner" });
  socket.take("registered");
  socket.receive("create_room", { mapId: "city", modeId: "1v1", conditionId: "standard" });
  const roomId = socket.take("room_state").room.id;
  const room = lobby.rooms.get(roomId);
  lobby.beginShutdown();

  socket.receive("start_room");
  socket.receive("leave_room");
  await lobby.flushPersistence();

  assert.equal(room.status, "waiting");
  assert.equal(room.match, null);
  assert.deepEqual(room.members, [client.id]);
  const recovery = await stateStore.loadRecovery(roomId, "waiting");
  assert.equal(recovery.recovery.reason, "server_shutdown");
  assert.deepEqual(recovery.members.map(member => member.id), [client.id]);
});
