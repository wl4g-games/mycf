import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { WebSocket } from "ws";

import { MemoryCache } from "../src/cache/memory-cache.js";
import { GameStateStore } from "../src/game-state-store.js";
import { createGameServer } from "../src/runtime.js";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function helloFrom(url, options) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, options);
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error("WebSocket hello timed out"));
    }, 2000);
    socket.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.once("message", raw => {
      clearTimeout(timeout);
      const message = JSON.parse(raw.toString());
      socket.close();
      resolve(message);
    });
  });
}

function messageFrom(socket, type, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`${type} message timed out`));
    }, timeoutMs);
    const onMessage = raw => {
      const message = JSON.parse(raw.toString());
      if (message.type !== type) return;
      cleanup();
      resolve(message.payload);
    };
    const onError = error => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error(`socket closed before ${type}`));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("error", onError);
      socket.off("close", onClose);
    };
    socket.on("message", onMessage);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

async function connectClient(url) {
  const socket = new WebSocket(url);
  const hello = messageFrom(socket, "hello");
  await once(socket, "open");
  await hello;
  return socket;
}

async function sendAndReceive(socket, requestType, payload, responseType) {
  const response = messageFrom(socket, responseType);
  socket.send(JSON.stringify({ type: requestType, payload }));
  return response;
}

test("the portable server runtime serves health and the canonical WebSocket path", async t => {
  const runtime = createGameServer();
  const address = await listen(runtime.server);
  t.after(async () => {
    await runtime.stop();
    await new Promise(resolve => runtime.server.close(resolve));
  });

  const origin = `http://127.0.0.1:${address.port}`;
  const healthResponse = await fetch(`${origin}/health`);
  const health = await healthResponse.json();
  assert.equal(health.ok, true);
  assert.deepEqual(health.cache, { backend: "memory", ready: true });
  assert.deepEqual(health.persistence, { ready: true });
  assert.equal(healthResponse.headers.get("cache-control"), "no-store");

  const hello = await helloFrom(`ws://127.0.0.1:${address.port}/ws`);
  assert.equal(hello.type, "hello");
  assert.equal(hello.payload.protocol, 1);

  await assert.rejects(
    helloFrom(`ws://127.0.0.1:${address.port}/api/ws`),
    /Unexpected server response: 404/,
  );

  await assert.rejects(
    helloFrom(`ws://127.0.0.1:${address.port}/ws`, { origin: "https://untrusted.example" }),
    /Unexpected server response: 403/,
  );
});

test("unregistered sockets time out and released connection capacity can be reused", async t => {
  const runtime = createGameServer({
    maxConnections: 2,
    maxConnectionsPerIp: 1,
    registrationTimeoutMs: 150,
  });
  const address = await listen(runtime.server);
  t.after(async () => {
    await runtime.stop();
    await new Promise(resolve => runtime.server.close(resolve));
  });

  const url = `ws://127.0.0.1:${address.port}/ws`;
  const first = new WebSocket(url);
  await once(first, "open");
  await assert.rejects(helloFrom(url), /Unexpected server response: 429/);

  const [code, reason] = await once(first, "close");
  assert.equal(code, 1008);
  assert.equal(reason.toString(), "registration timeout");

  const hello = await helloFrom(url);
  assert.equal(hello.type, "hello");
});

test("runtime readiness fails closed when the shared cache becomes unavailable", async t => {
  const cache = new MemoryCache();
  await cache.connect();
  const runtime = createGameServer({ cache });
  const address = await listen(runtime.server);
  t.after(async () => {
    await runtime.stop();
    await new Promise(resolve => runtime.server.close(resolve));
  });
  await cache.close();

  const origin = `http://127.0.0.1:${address.port}`;
  const healthResponse = await fetch(`${origin}/health`);
  const health = await healthResponse.json();
  assert.equal(healthResponse.status, 503);
  assert.equal(health.ok, false);
  assert.deepEqual(health.cache, { backend: "memory", ready: false });
  await assert.rejects(
    helloFrom(`ws://127.0.0.1:${address.port}/ws`),
    /Unexpected server response: 503/,
  );
});

test("runtime reuses an injected state store cache without taking ownership", async () => {
  class TrackingCache extends MemoryCache {
    closeCalls = 0;

    async close() {
      this.closeCalls += 1;
      return super.close();
    }
  }
  const cache = new TrackingCache();
  await cache.connect();
  const stateStore = new GameStateStore(cache);
  const runtime = createGameServer({ stateStore });

  assert.equal(runtime.cache, cache);
  assert.equal(runtime.stateStore, stateStore);
  await runtime.stop();
  assert.equal(cache.closeCalls, 0);
  assert.equal(cache.isReady, true);

  await cache.close();
});

test("graceful shutdown archives complete rooms before waiting for real socket disconnects", async t => {
  const cache = new MemoryCache();
  await cache.connect();
  const runtime = createGameServer({ cache, closeCacheOnStop: false, shutdownSocketGraceMs: 100 });
  const address = await listen(runtime.server);
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
    await runtime.stop().catch(() => {});
    if (runtime.server.listening) await new Promise(resolve => runtime.server.close(resolve));
    if (cache.isReady) await cache.close();
  });
  const url = `ws://127.0.0.1:${address.port}/ws`;
  const ownerSocket = await connectClient(url);
  const guestSocket = await connectClient(url);
  const waitingSocket = await connectClient(url);
  sockets.push(ownerSocket, guestSocket, waitingSocket);

  const owner = await sendAndReceive(ownerSocket, "register", { alias: "ShutdownOwner" }, "registered");
  const guest = await sendAndReceive(guestSocket, "register", { alias: "ShutdownGuest" }, "registered");
  await sendAndReceive(waitingSocket, "register", { alias: "WaitingOwner" }, "registered");
  const activeRoom = await sendAndReceive(
    ownerSocket,
    "create_room",
    { mapId: "city", modeId: "1v1", conditionId: "standard" },
    "room_state",
  );
  const waitingRoom = await sendAndReceive(
    waitingSocket,
    "create_room",
    { mapId: "wild", modeId: "4v4", conditionId: "standard" },
    "room_state",
  );
  const invite = messageFrom(guestSocket, "invite");
  ownerSocket.send(JSON.stringify({ type: "invite", payload: { targetId: guest.self.id } }));
  await invite;
  await sendAndReceive(
    guestSocket,
    "respond_invite",
    { roomId: activeRoom.room.id, accept: true },
    "room_state",
  );
  const ownerStart = messageFrom(ownerSocket, "match_start");
  const guestStart = messageFrom(guestSocket, "match_start");
  ownerSocket.send(JSON.stringify({ type: "start_room", payload: {} }));
  await Promise.all([ownerStart, guestStart]);

  await runtime.stop();
  assert.equal(runtime.lobby.clients.size, 0);
  assert.equal(runtime.lobby.rooms.size, 0);
  assert.equal(runtime.webSockets.clients.size, 0);
  assert.equal(cache.isReady, true);
  const activeRecovery = await runtime.stateStore.loadRecovery(activeRoom.room.id);
  assert.equal(activeRecovery.recovery.reason, "server_shutdown");
  assert.deepEqual(
    activeRecovery.members.map(member => member.id).sort(),
    [owner.self.id, guest.self.id].sort(),
  );
  assert(activeRecovery.match);
  assert.deepEqual(
    activeRecovery.match.actors.filter(actor => actor.userId).map(actor => actor.userId).sort(),
    [owner.self.id, guest.self.id].sort(),
  );
  const waitingRecovery = await runtime.stateStore.loadRecovery(waitingRoom.room.id);
  assert.equal(waitingRecovery.recovery.reason, "server_shutdown");
  assert.equal(waitingRecovery.status, "waiting");
  assert.equal(waitingRecovery.match, null);
});

test("Vercel configuration enables Fluid compute for the container function", async () => {
  const config = JSON.parse(await import("node:fs/promises").then(fs => fs.readFile(new URL("../vercel.json", import.meta.url), "utf8")));
  assert.equal(config.framework, "container");
  assert.equal(config.fluid, true);
  assert.equal("buildCommand" in config, false);
  assert.equal("outputDirectory" in config, false);
  assert.equal("functions" in config, false);
  assert.equal("rewrites" in config, false);
});
