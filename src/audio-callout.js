export const GRENADE_CALLOUT_ASSETS = Object.freeze({
  en: new URL("../assets/grenade-incoming-en.mp3", import.meta.url).href,
  zh: new URL("../assets/grenade-incoming-zh.mp3", import.meta.url).href,
});

export function resolveGrenadeCalloutAsset(locale = "en") {
  return String(locale).toLowerCase().startsWith("zh")
    ? GRENADE_CALLOUT_ASSETS.zh
    : GRENADE_CALLOUT_ASSETS.en;
}

function decodeAudio(context, encoded) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const succeed = buffer => {
      if (settled) return;
      settled = true;
      resolve(buffer);
    };
    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    try {
      const result = context.decodeAudioData(encoded, succeed, fail);
      if (result && typeof result.then === "function") result.then(succeed, fail);
    } catch (error) {
      fail(error);
    }
  });
}

export class AudioCalloutPlayer {
  constructor({ fetcher = (...args) => globalThis.fetch(...args) } = {}) {
    this.fetcher = fetcher;
    this.buffers = new WeakMap();
    this.pending = new WeakMap();
  }

  cacheFor(store, context) {
    let cache = store.get(context);
    if (!cache) {
      cache = new Map();
      store.set(context, cache);
    }
    return cache;
  }

  async load(context, url) {
    const buffers = this.cacheFor(this.buffers, context);
    if (buffers.has(url)) return buffers.get(url);

    const pending = this.cacheFor(this.pending, context);
    if (pending.has(url)) return pending.get(url);
    const request = (async () => {
      const response = await this.fetcher(url);
      if (!response?.ok) throw new Error(`Callout audio request failed with HTTP ${response?.status || 0}.`);
      const buffer = await decodeAudio(context, await response.arrayBuffer());
      buffers.set(url, buffer);
      return buffer;
    })();
    pending.set(url, request);
    try {
      return await request;
    } finally {
      pending.delete(url);
    }
  }

  preload(context) {
    if (!context) return Promise.resolve([]);
    return Promise.allSettled(Object.values(GRENADE_CALLOUT_ASSETS).map(url => this.load(context, url)));
  }

  start(context, destination, buffer, { gain = .95, pan = 0 } = {}) {
    const source = context.createBufferSource();
    const level = context.createGain();
    source.buffer = buffer;
    level.gain.value = gain;
    source.connect(level);
    if (typeof context.createStereoPanner === "function") {
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, Number(pan) || 0));
      level.connect(panner).connect(destination);
    } else {
      level.connect(destination);
    }
    source.start();
    return source;
  }

  play(context, destination, { locale = "en", gain = .95, pan = 0, onFailure = () => {} } = {}) {
    if (!context || !destination) return false;
    const url = resolveGrenadeCalloutAsset(locale);
    const buffer = this.cacheFor(this.buffers, context).get(url);
    if (buffer) {
      this.start(context, destination, buffer, { gain, pan });
      return true;
    }
    this.load(context, url)
      .then(loaded => this.start(context, destination, loaded, { gain, pan }))
      .catch(onFailure);
    return true;
  }
}
