function notImplemented(method) {
  return new Error(`${method} is not implemented.`);
}

export function assertCacheKey(value, label = "key") {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

export function assertScanPrefix(value) {
  if (typeof value !== "string") throw new TypeError("prefix must be a string.");
  return value;
}

export function normalizeTtl(options = {}) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("cache options must be an object.");
  }
  const { ttlMs } = options;
  if (ttlMs === undefined) return undefined;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new RangeError("ttlMs must be a positive safe integer.");
  }
  return ttlMs;
}

export function encodeJson(value) {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError("cache values must be JSON serializable.");
  return encoded;
}

export function decodeJson(value) {
  return value === null || value === undefined ? null : JSON.parse(value);
}

export class ICache {
  get backend() { throw notImplemented("backend"); }

  get isReady() { return false; }

  async connect() { throw notImplemented("connect"); }

  async close() { throw notImplemented("close"); }

  async get(_key) { throw notImplemented("get"); }

  async set(_key, _value, _options = {}) { throw notImplemented("set"); }

  async delete(_key) { throw notImplemented("delete"); }

  async scan(_prefix = "") { throw notImplemented("scan"); }

  async setIfAbsent(_key, _value, _options = {}) { throw notImplemented("setIfAbsent"); }

  async compareAndDelete(_key, _expectedValue) { throw notImplemented("compareAndDelete"); }

  async publish(_channel, _payload) { throw notImplemented("publish"); }

  async subscribe(_channel, _listener) { throw notImplemented("subscribe"); }
}
