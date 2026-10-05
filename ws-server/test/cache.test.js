import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createCache, resolveCacheConfig } from "../src/cache/cache-factory.js";
import { MemoryCache } from "../src/cache/memory-cache.js";
import { RedisCache } from "../src/cache/redis-cache.js";

class FakeRedisClient extends EventEmitter {
  constructor(shared = {}, { failConnect = false, duplicateFails = false } = {}) {
    super();
    this.shared = shared;
    this.shared.values ||= new Map();
    this.shared.listeners ||= new Map();
    this.failConnect = failConnect;
    this.duplicateFails = duplicateFails;
    this.isOpen = false;
    this.isReady = false;
    this.connectCalls = 0;
    this.closeCalls = 0;
    this.destroyCalls = 0;
    this.setCalls = [];
    this.duplicateClient = null;
  }

  duplicate() {
    this.duplicateClient = new FakeRedisClient(this.shared, { failConnect: this.duplicateFails });
    return this.duplicateClient;
  }

  async connect() {
    this.connectCalls += 1;
    if (this.failConnect) throw new Error("redis unavailable");
    this.isOpen = true;
    this.isReady = true;
    return this;
  }

  async close() {
    this.closeCalls += 1;
    this.isOpen = false;
    this.isReady = false;
  }

  destroy() {
    this.destroyCalls += 1;
    this.isOpen = false;
    this.isReady = false;
  }

  async get(key) { return this.shared.values.get(key) ?? null; }

  async set(key, value, options) {
    this.setCalls.push({ key, value, options });
    if (options?.NX && this.shared.values.has(key)) return null;
    this.shared.values.set(key, value);
    return "OK";
  }

  async del(key) { return this.shared.values.delete(key) ? 1 : 0; }

  async eval(_script, { keys, arguments: values }) {
    if (this.shared.values.get(keys[0]) !== values[0]) return 0;
    this.shared.values.delete(keys[0]);
    return 1;
  }

  async *scanIterator({ MATCH }) {
    const prefix = MATCH.slice(0, -1).replace(/\\(.)/g, "$1");
    yield [...this.shared.values.keys()].filter(key => key.startsWith(prefix));
  }

  async publish(channel, message) {
    const listeners = [...(this.shared.listeners.get(channel) || [])];
    for (const listener of listeners) listener(message);
    return listeners.length;
  }

  async subscribe(channel, listener) {
    const listeners = this.shared.listeners.get(channel) || new Set();
    listeners.add(listener);
    this.shared.listeners.set(channel, listeners);
  }

  async unsubscribe(channel, listener) {
    const listeners = this.shared.listeners.get(channel);
    listeners?.delete(listener);
    if (listeners?.size === 0) this.shared.listeners.delete(channel);
  }
}

test("memory cache preserves JSON boundaries, TTL, scans, and lease primitives", async () => {
  let now = 1000;
  const cache = new MemoryCache({ now: () => now });
  assert.equal(cache.isReady, false);
  await assert.rejects(cache.get("missing"), /not connected/);
  await cache.connect();

  const source = { nested: { value: 1 } };
  await cache.set("rooms:b", source);
  source.nested.value = 9;
  const firstRead = await cache.get("rooms:b");
  assert.deepEqual(firstRead, { nested: { value: 1 } });
  firstRead.nested.value = 7;
  assert.deepEqual(await cache.get("rooms:b"), { nested: { value: 1 } });

  await cache.set("rooms:a", { active: true }, { ttlMs: 50 });
  assert.deepEqual((await cache.scan("rooms:")).map(entry => entry.key), ["rooms:a", "rooms:b"]);
  now += 50;
  assert.equal(await cache.get("rooms:a"), null);
  assert.deepEqual((await cache.scan("rooms:")).map(entry => entry.key), ["rooms:b"]);

  assert.equal(await cache.setIfAbsent("lease", "token-a", { ttlMs: 500 }), true);
  assert.equal(await cache.setIfAbsent("lease", "token-b"), false);
  assert.equal(await cache.compareAndDelete("lease", "token-b"), false);
  assert.equal(await cache.compareAndDelete("lease", "token-a"), true);
  assert.equal(await cache.get("lease"), null);
  await assert.rejects(cache.set("bad", {}, { ttlMs: 0 }), /positive safe integer/);
  await cache.close();
  assert.equal(cache.isReady, false);
});

test("memory cache pub/sub can share an injected process-local channel registry", async () => {
  const channels = new Map();
  const publisher = new MemoryCache({ channels });
  const subscriber = new MemoryCache({ channels });
  await Promise.all([publisher.connect(), subscriber.connect()]);
  const received = [];
  const unsubscribe = await subscriber.subscribe("room:ABC", payload => received.push(payload));
  assert.equal(await publisher.publish("room:ABC", { revision: 2 }), 1);
  assert.deepEqual(received, [{ revision: 2 }]);
  await unsubscribe();
  assert.equal(await publisher.publish("room:ABC", { revision: 3 }), 0);
  await Promise.all([publisher.close(), subscriber.close()]);
});

test("cache config defaults to memory and validates Redis settings strictly", async () => {
  assert.deepEqual(resolveCacheConfig({}), { backend: "memory" });
  const memory = await createCache({ env: {} });
  assert(memory instanceof MemoryCache);
  assert.equal(memory.isReady, true);
  await memory.close();

  assert.throws(() => resolveCacheConfig({ MYCF_REDIS_HOST: "redis.internal" }), /configured together/);
  assert.throws(() => resolveCacheConfig({ MYCF_REDIS_PORT: "6379" }), /configured together/);
  assert.throws(() => resolveCacheConfig({ MYCF_REDIS_HOST: "redis", MYCF_REDIS_PORT: "0" }), /between 1 and 65535/);
  assert.throws(() => resolveCacheConfig({ MYCF_REDIS_URL: "https://redis.example" }), /redis:\/\/ or rediss:\/\//);
  assert.throws(() => resolveCacheConfig({ MYCF_REDIS_PASSWORD: "secret" }), /require MYCF_REDIS_URL/);
  assert.throws(() => resolveCacheConfig({
    MYCF_REDIS_URL: "rediss://redis.example:6380/0",
    MYCF_REDIS_TLS: "false",
  }), /conflicts/);
});

test("Redis config supports endpoint, TLS, credentials, database, and prefix", () => {
  const config = resolveCacheConfig({
    MYCF_REDIS_HOST: "redis.internal",
    MYCF_REDIS_PORT: "6380",
    MYCF_REDIS_TLS: "true",
    MYCF_REDIS_USERNAME: "game",
    MYCF_REDIS_PASSWORD: " secret ",
    MYCF_REDIS_DATABASE: "3",
    MYCF_REDIS_PREFIX: "test:",
  });
  assert.equal(config.backend, "redis");
  assert.equal(config.prefix, "test:");
  assert.equal(config.clientOptions.socket.host, "redis.internal");
  assert.equal(config.clientOptions.socket.port, 6380);
  assert.equal(config.clientOptions.socket.tls, true);
  assert.equal(config.clientOptions.socket.connectTimeout, 5000);
  assert.equal(config.clientOptions.disableOfflineQueue, true);
  assert.equal(config.clientOptions.username, "game");
  assert.equal(config.clientOptions.password, " secret ");
  assert.equal(config.clientOptions.database, 3);
  const reconnect = config.clientOptions.socket.reconnectStrategy;
  assert.equal(reconnect(0), 100);
  assert.equal(reconnect(1), 200);
  assert.equal(reconnect(4), 1600);
  assert.equal(reconnect(5), 2000);
  assert.equal(reconnect(50), 2000);

  const fromUrl = resolveCacheConfig({ MYCF_REDIS_URL: "rediss://user:pass@cache.example:6380/4" });
  assert.equal(fromUrl.clientOptions.socket.host, "cache.example");
  assert.equal(fromUrl.clientOptions.socket.tls, true);
  assert.equal(fromUrl.clientOptions.username, "user");
  assert.equal(fromUrl.clientOptions.password, "pass");
  assert.equal(fromUrl.clientOptions.database, 4);

  const marketplace = resolveCacheConfig({ REDIS_URL: "rediss://market:secret@market.redis.example:6380/2" });
  assert.equal(marketplace.clientOptions.socket.host, "market.redis.example");
  assert.equal(marketplace.clientOptions.socket.tls, true);
  assert.equal(marketplace.clientOptions.username, "market");
  assert.equal(marketplace.clientOptions.database, 2);
  assert.throws(
    () => resolveCacheConfig({ REDIS_URL: "rediss://market.redis.example:6380", MYCF_REDIS_TLS: "false" }),
    /REDIS_URL protocol/,
  );

  const explicitPair = resolveCacheConfig({
    REDIS_URL: "rediss://market.redis.example:6380",
    MYCF_REDIS_HOST: "private.redis.internal",
    MYCF_REDIS_PORT: "6379",
  });
  assert.equal(explicitPair.clientOptions.socket.host, "private.redis.internal");
  assert.equal(explicitPair.clientOptions.socket.port, 6379);
  assert.equal(explicitPair.clientOptions.socket.tls, false);
});

test("Redis cache uses namespaced JSON commands, scan, leases, and pub/sub", async () => {
  const shared = {};
  const root = new FakeRedisClient(shared);
  let factoryOptions;
  const cache = await createCache({
    env: {
      MYCF_REDIS_HOST: "redis.internal",
      MYCF_REDIS_PORT: "6379",
      MYCF_REDIS_PREFIX: "game:",
    },
    redisClientFactory: options => {
      factoryOptions = options;
      return root;
    },
  });
  assert(cache instanceof RedisCache);
  assert.equal(cache.isReady, true);
  assert.equal(typeof factoryOptions.socket.reconnectStrategy, "function");
  assert.equal(root.connectCalls, 1);
  assert.equal(root.duplicateClient.connectCalls, 1);

  await cache.set("rooms:B", { revision: 1 }, { ttlMs: 900 });
  await cache.set("rooms:A", { revision: 2 });
  assert.deepEqual(root.setCalls[0], {
    key: "game:rooms:B",
    value: '{"revision":1}',
    options: { PX: 900 },
  });
  assert.deepEqual(await cache.get("rooms:B"), { revision: 1 });
  assert.deepEqual((await cache.scan("rooms:")).map(entry => entry.key), ["rooms:A", "rooms:B"]);

  assert.equal(await cache.setIfAbsent("lease", "owner-a", { ttlMs: 1000 }), true);
  assert.equal(await cache.setIfAbsent("lease", "owner-b"), false);
  assert.equal(await cache.compareAndDelete("lease", "owner-b"), false);
  assert.equal(await cache.compareAndDelete("lease", "owner-a"), true);

  const messages = [];
  const unsubscribe = await cache.subscribe("room:ABC", payload => messages.push(payload));
  assert.equal(await cache.publish("room:ABC", { type: "snapshot" }), 1);
  assert.deepEqual(messages, [{ type: "snapshot" }]);
  await unsubscribe();
  assert.equal(await cache.publish("room:ABC", { type: "late" }), 0);

  await cache.close();
  assert.equal(cache.isReady, false);
  assert.equal(root.closeCalls, 1);
  assert.equal(root.duplicateClient.closeCalls, 1);
});

test("Redis connection failures reject the factory and close opened clients", async () => {
  const root = new FakeRedisClient({}, { duplicateFails: true });
  await assert.rejects(createCache({
    env: { MYCF_REDIS_HOST: "redis", MYCF_REDIS_PORT: "6379" },
    redisClientFactory: () => root,
  }), /redis unavailable/);
  assert.equal(root.closeCalls, 1);
  assert.equal(root.isOpen, false);
});

test("Redis startup has a deadline even though runtime reconnect backoff is indefinite", async () => {
  const root = new FakeRedisClient();
  root.connect = async function connectForever() {
    this.connectCalls += 1;
    this.isOpen = true;
    return new Promise(() => {});
  };
  await assert.rejects(createCache({
    env: { MYCF_REDIS_HOST: "redis", MYCF_REDIS_PORT: "6379" },
    redisClientFactory: () => root,
    redisStartupTimeoutMs: 5,
  }), /startup connection timed out/);
  assert.equal(root.destroyCalls, 1);
  assert.equal(root.isOpen, false);
});
