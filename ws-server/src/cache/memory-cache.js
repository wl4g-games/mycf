import { ICache, assertCacheKey, assertScanPrefix, decodeJson, encodeJson, normalizeTtl } from "./i-cache.js";

export class MemoryCache extends ICache {
  constructor({ now = Date.now, entries = new Map(), channels = new Map(), onError } = {}) {
    super();
    if (typeof now !== "function") throw new TypeError("now must be a function.");
    this.now = now;
    this.entries = entries;
    this.channels = channels;
    this.onError = typeof onError === "function" ? onError : null;
    this.subscriptions = new Set();
    this.ready = false;
    this.lastError = null;
  }

  get backend() { return "memory"; }

  get isReady() { return this.ready; }

  async connect() {
    this.ready = true;
    return this;
  }

  async close() {
    if (!this.ready && this.subscriptions.size === 0) return;
    for (const unsubscribe of [...this.subscriptions]) await unsubscribe();
    this.ready = false;
  }

  assertReady() {
    if (!this.ready) throw new Error("Memory cache is not connected.");
  }

  liveEntry(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  async get(key) {
    this.assertReady();
    assertCacheKey(key);
    const entry = this.liveEntry(key);
    return entry ? decodeJson(entry.encoded) : null;
  }

  async set(key, value, options = {}) {
    this.assertReady();
    assertCacheKey(key);
    const ttlMs = normalizeTtl(options);
    this.entries.set(key, {
      encoded: encodeJson(value),
      expiresAt: ttlMs === undefined ? null : this.now() + ttlMs,
    });
  }

  async delete(key) {
    this.assertReady();
    assertCacheKey(key);
    this.liveEntry(key);
    return this.entries.delete(key);
  }

  async scan(prefix = "") {
    this.assertReady();
    assertScanPrefix(prefix);
    const matches = [];
    for (const key of [...this.entries.keys()]) {
      const entry = this.liveEntry(key);
      if (entry && key.startsWith(prefix)) matches.push({ key, value: decodeJson(entry.encoded) });
    }
    return matches.sort((left, right) => left.key.localeCompare(right.key));
  }

  async setIfAbsent(key, value, options = {}) {
    this.assertReady();
    assertCacheKey(key);
    const encoded = encodeJson(value);
    const ttlMs = normalizeTtl(options);
    if (this.liveEntry(key)) return false;
    this.entries.set(key, {
      encoded,
      expiresAt: ttlMs === undefined ? null : this.now() + ttlMs,
    });
    return true;
  }

  async compareAndDelete(key, expectedValue) {
    this.assertReady();
    assertCacheKey(key);
    const encoded = encodeJson(expectedValue);
    const entry = this.liveEntry(key);
    if (!entry || entry.encoded !== encoded) return false;
    this.entries.delete(key);
    return true;
  }

  async publish(channel, payload) {
    this.assertReady();
    assertCacheKey(channel, "channel");
    const encoded = encodeJson(payload);
    const listeners = [...(this.channels.get(channel) || [])];
    for (const listener of listeners) {
      try {
        await listener(decodeJson(encoded));
      } catch (error) {
        this.reportError(error);
      }
    }
    return listeners.length;
  }

  async subscribe(channel, listener) {
    this.assertReady();
    assertCacheKey(channel, "channel");
    if (typeof listener !== "function") throw new TypeError("listener must be a function.");
    const listeners = this.channels.get(channel) || new Set();
    listeners.add(listener);
    this.channels.set(channel, listeners);
    let active = true;
    const unsubscribe = async () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);
      if (listeners.size === 0) this.channels.delete(channel);
      this.subscriptions.delete(unsubscribe);
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
