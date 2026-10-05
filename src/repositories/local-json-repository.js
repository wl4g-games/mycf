function cloneDocument(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function resolveBrowserStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function resolveBrowserEventTarget() {
  try {
    return globalThis.window || null;
  } catch {
    return null;
  }
}

/**
 * Shared browser-local JSON persistence used by the domain repositories.
 * It keeps an in-memory fallback when storage is unavailable and returns
 * detached values so callers cannot mutate repository state by reference.
 */
export class LocalJsonRepository {
  constructor({
    key,
    normalize,
    storage = resolveBrowserStorage(),
    eventTarget = resolveBrowserEventTarget(),
  }) {
    if (!key || typeof key !== "string") throw new TypeError("A repository storage key is required.");
    if (typeof normalize !== "function") throw new TypeError("A repository normalizer is required.");
    this.key = key;
    this.normalize = normalize;
    this.storage = storage;
    this.eventTarget = eventTarget;
    this.listeners = new Set();
    this.memoryValue = this.normalize();
    this.memoryOnly = !storage;
    this.storageListener = event => this.handleStorageEvent(event);
  }

  parse(rawValue) {
    if (rawValue === null || rawValue === undefined) return this.normalize();
    try {
      return this.normalize(JSON.parse(rawValue));
    } catch {
      return this.normalize();
    }
  }

  load() {
    if (this.memoryOnly) return cloneDocument(this.memoryValue);
    try {
      this.memoryValue = this.parse(this.storage.getItem(this.key));
    } catch {
      this.memoryOnly = true;
    }
    return cloneDocument(this.memoryValue);
  }

  save(value) {
    this.memoryValue = this.normalize(value);
    if (!this.memoryOnly) {
      try {
        this.storage.setItem(this.key, JSON.stringify(this.memoryValue));
      } catch {
        this.memoryOnly = true;
      }
    }
    const snapshot = cloneDocument(this.memoryValue);
    this.notify(snapshot);
    return snapshot;
  }

  clear() {
    this.memoryValue = this.normalize();
    if (!this.memoryOnly) {
      try {
        this.storage.removeItem(this.key);
      } catch {
        this.memoryOnly = true;
      }
    }
    const snapshot = cloneDocument(this.memoryValue);
    this.notify(snapshot);
    return snapshot;
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("A repository listener must be a function.");
    if (this.listeners.size === 0 && typeof this.eventTarget?.addEventListener === "function") {
      this.eventTarget.addEventListener("storage", this.storageListener);
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && typeof this.eventTarget?.removeEventListener === "function") {
        this.eventTarget.removeEventListener("storage", this.storageListener);
      }
    };
  }

  handleStorageEvent(event) {
    if (event?.key !== this.key) return;
    if (event.storageArea && this.storage && event.storageArea !== this.storage) return;
    this.memoryOnly = !this.storage;
    this.memoryValue = this.parse(event.newValue);
    this.notify(cloneDocument(this.memoryValue));
  }

  notify(value) {
    for (const listener of [...this.listeners]) listener(cloneDocument(value));
  }
}

export { cloneDocument };
