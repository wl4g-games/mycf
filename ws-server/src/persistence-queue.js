const sleep = delayMs => new Promise(resolve => setTimeout(resolve, delayMs));

export class PersistenceQueue {
  constructor({
    retryAttempts = 3,
    retryBaseDelayMs = 50,
    isBackendReady = () => true,
    onError = () => {},
  } = {}) {
    this.retryAttempts = retryAttempts;
    this.retryBaseDelayMs = retryBaseDelayMs;
    this.isBackendReady = isBackendReady;
    this.onError = onError;
    this.pending = new Set();
    this.chains = new Map();
    this.tokens = new Map();
    this.failed = new Map();
    this.errors = new Map();
    this.lastError = null;
  }

  schedule(key, operation) {
    if (!operation) return;
    const token = Symbol(key);
    this.tokens.set(key, token);
    this.failed.delete(key);
    this.enqueue(key, operation, token);
  }

  enqueue(key, operation, token) {
    const previous = this.chains.get(key) || Promise.resolve();
    let tracked;
    tracked = previous
      .catch(() => {})
      .then(() => this.run(key, operation, token))
      .catch(() => {})
      .finally(() => {
        this.pending.delete(tracked);
        if (this.chains.get(key) === tracked) this.chains.delete(key);
      });
    this.chains.set(key, tracked);
    this.pending.add(tracked);
  }

  async run(key, operation, token) {
    const attempts = Math.max(1, Math.trunc(this.retryAttempts) || 1);
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const result = await operation();
        if (this.tokens.get(key) === token) {
          this.failed.delete(key);
          this.tokens.delete(key);
          this.clearError(key);
        }
        return result;
      } catch (error) {
        lastError = error;
        this.recordError(key, error);
        if (attempt + 1 < attempts) {
          const baseDelay = Math.max(0, Number(this.retryBaseDelayMs) || 0);
          await sleep(Math.min(1000, baseDelay * (2 ** attempt)));
        }
      }
    }
    if (this.tokens.get(key) === token) this.failed.set(key, { operation, token });
    throw lastError;
  }

  retryFailed() {
    if (!this.isBackendReady()) return;
    for (const [key, failed] of this.failed) {
      if (this.tokens.get(key) !== failed.token) {
        this.failed.delete(key);
        continue;
      }
      if (this.chains.has(key)) continue;
      this.failed.delete(key);
      this.enqueue(key, failed.operation, failed.token);
    }
  }

  recordError(key, error) {
    const shouldNotify = !this.errors.has(key);
    this.errors.set(key, error);
    this.lastError = error;
    if (!shouldNotify) return;
    try { this.onError(error); } catch {}
  }

  clearError(key) {
    this.errors.delete(key);
    this.lastError = [...this.errors.values()].at(-1) || null;
  }

  async flush() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
    if (this.errors.size) {
      throw new AggregateError(
        [...this.errors.values()],
        "One or more persistence operations failed after bounded retries.",
      );
    }
  }
}
