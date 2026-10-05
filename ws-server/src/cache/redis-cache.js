import { ICache, assertCacheKey, assertScanPrefix, decodeJson, encodeJson, normalizeTtl } from "./i-cache.js";

const COMPARE_AND_DELETE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

function escapeRedisGlob(value) {
  let escaped = "";
  for (const character of value) escaped += "\\*?[]".includes(character) ? `\\${character}` : character;
  return escaped;
}

async function closeClient(client) {
  if (!client?.isOpen) return;
  try {
    await client.close();
  } catch (error) {
    if (typeof client.destroy === "function") client.destroy();
    throw error;
  }
}

export class RedisCache extends ICache {
  constructor({ client, subscriber, prefix = "mycf:", onError } = {}) {
    super();
    if (!client) throw new TypeError("A Redis command client is required.");
    if (typeof prefix !== "string") throw new TypeError("prefix must be a string.");
    this.client = client;
    this.subscriber = subscriber || client.duplicate();
    if (!this.subscriber) throw new TypeError("A Redis subscriber client is required.");
    this.prefix = prefix;
    this.onError = typeof onError === "function" ? onError : null;
    this.subscriptions = new Set();
    this.connected = false;
    this.connecting = null;
    this.lastError = null;
    this.handleClientError = error => this.reportError(error);
    this.client.on?.("error", this.handleClientError);
    if (this.subscriber !== this.client) this.subscriber.on?.("error", this.handleClientError);
  }

  get backend() { return "redis"; }

  get isReady() {
    return this.connected && this.client.isReady === true && this.subscriber.isReady === true;
  }

  async connect() {
    if (this.isReady) return this;
    if (this.connecting) return this.connecting;
    this.connecting = this.openClients();
    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async openClients() {
    try {
      if (!this.client.isOpen) await this.client.connect();
      if (!this.subscriber.isOpen) await this.subscriber.connect();
      if (this.client.isReady !== true || this.subscriber.isReady !== true) {
        throw new Error("Redis clients did not become ready.");
      }
      this.connected = true;
      return this;
    } catch (error) {
      this.connected = false;
      await Promise.allSettled([closeClient(this.subscriber), closeClient(this.client)]);
      throw error;
    }
  }

  async close() {
    this.connected = false;
    const errors = [];
    for (const unsubscribe of [...this.subscriptions]) {
      try { await unsubscribe(); } catch (error) { errors.push(error); }
    }
    const clients = this.subscriber === this.client ? [this.client] : [this.subscriber, this.client];
    for (const client of clients) {
      try { await closeClient(client); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Failed to close Redis cache cleanly.");
  }

  abort() {
    this.connected = false;
    const clients = this.subscriber === this.client ? [this.client] : [this.subscriber, this.client];
    for (const client of clients) {
      if (client?.isOpen && typeof client.destroy === "function") {
        try { client.destroy(); } catch {}
      }
    }
  }

  assertReady() {
    if (!this.isReady) throw new Error("Redis cache is not connected.");
  }

  physicalKey(key) { return `${this.prefix}${key}`; }

  physicalChannel(channel) { return `${this.prefix}${channel}`; }

  async get(key) {
    this.assertReady();
    assertCacheKey(key);
    return decodeJson(await this.client.get(this.physicalKey(key)));
  }

  async set(key, value, options = {}) {
    this.assertReady();
    assertCacheKey(key);
    const encoded = encodeJson(value);
    const ttlMs = normalizeTtl(options);
    if (ttlMs === undefined) await this.client.set(this.physicalKey(key), encoded);
    else await this.client.set(this.physicalKey(key), encoded, { PX: ttlMs });
  }

  async delete(key) {
    this.assertReady();
    assertCacheKey(key);
    return Number(await this.client.del(this.physicalKey(key))) > 0;
  }

  async scan(prefix = "") {
    this.assertReady();
    assertScanPrefix(prefix);
    const logicalEntries = new Map();
    const physicalPrefix = this.physicalKey(prefix);
    const match = `${escapeRedisGlob(physicalPrefix)}*`;
    for await (const keys of this.client.scanIterator({ MATCH: match, COUNT: 100 })) {
      for (const physicalKey of keys) {
        if (typeof physicalKey !== "string" || !physicalKey.startsWith(physicalPrefix)) continue;
        const encoded = await this.client.get(physicalKey);
        if (encoded === null || encoded === undefined) continue;
        const key = physicalKey.slice(this.prefix.length);
        logicalEntries.set(key, decodeJson(encoded));
      }
    }
    return [...logicalEntries]
      .map(([key, value]) => ({ key, value }))
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  async setIfAbsent(key, value, options = {}) {
    this.assertReady();
    assertCacheKey(key);
    const encoded = encodeJson(value);
    const ttlMs = normalizeTtl(options);
    const redisOptions = { NX: true };
    if (ttlMs !== undefined) redisOptions.PX = ttlMs;
    return await this.client.set(this.physicalKey(key), encoded, redisOptions) === "OK";
  }

  async compareAndDelete(key, expectedValue) {
    this.assertReady();
    assertCacheKey(key);
    const result = await this.client.eval(COMPARE_AND_DELETE_SCRIPT, {
      keys: [this.physicalKey(key)],
      arguments: [encodeJson(expectedValue)],
    });
    return Number(result) === 1;
  }

  async publish(channel, payload) {
    this.assertReady();
    assertCacheKey(channel, "channel");
    return Number(await this.client.publish(this.physicalChannel(channel), encodeJson(payload)));
  }

  async subscribe(channel, listener) {
    this.assertReady();
    assertCacheKey(channel, "channel");
    if (typeof listener !== "function") throw new TypeError("listener must be a function.");
    const physicalChannel = this.physicalChannel(channel);
    const wrapped = encoded => {
      try {
        const result = listener(decodeJson(encoded));
        Promise.resolve(result).catch(error => this.reportError(error));
      } catch (error) {
        this.reportError(error);
      }
    };
    await this.subscriber.subscribe(physicalChannel, wrapped);
    let active = true;
    const unsubscribe = async () => {
      if (!active) return;
      active = false;
      this.subscriptions.delete(unsubscribe);
      if (this.subscriber.isReady === true) await this.subscriber.unsubscribe(physicalChannel, wrapped);
    };
    this.subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  reportError(error) {
    this.lastError = error;
    if (!this.onError) return;
    try { this.onError(error); } catch {}
  }
}
