function networkError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function resolveWebSocketUrl(locationValue, configuredValue = "") {
  const configured = String(configuredValue || "").trim();
  if (configured) {
    const endpoint = new URL(configured, locationValue.href);
    if (endpoint.protocol === "http:") endpoint.protocol = "ws:";
    if (endpoint.protocol === "https:") endpoint.protocol = "wss:";
    if (endpoint.protocol !== "ws:" && endpoint.protocol !== "wss:") {
      throw networkError("BAD_WS_ENDPOINT", "The configured multiplayer endpoint must use HTTP or WebSocket transport.");
    }
    if (endpoint.pathname === "/") endpoint.pathname = "/ws";
    return endpoint.href;
  }
  if (locationValue.hostname.endsWith(".github.io")) {
    throw networkError("WS_ENDPOINT_REQUIRED", "This static deployment requires a separate multiplayer endpoint.");
  }
  const protocol = locationValue.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${locationValue.host}/ws`;
}

export class NetworkClient {
  constructor({ stateRepository } = {}) {
    if (!stateRepository || typeof stateRepository.load !== "function"
      || typeof stateRepository.save !== "function" || typeof stateRepository.clear !== "function") {
      throw new TypeError("NetworkClient requires a synchronous room state repository.");
    }
    this.socket = null;
    this.handlers = new Map();
    this.stateRepository = stateRepository;
    const state = this.stateRepository.load();
    this.self = state.self;
    this.room = state.room;
    this.users = state.users;
    this.connected = state.connected;
    this.registerPromise = null;
  }

  persistState() {
    const state = this.stateRepository.save({
      connected: this.connected,
      self: this.self,
      users: this.users,
      room: this.room,
    });
    this.connected = state.connected;
    this.self = state.self;
    this.users = state.users;
    this.room = state.room;
    return state;
  }

  clearState() {
    const state = this.stateRepository.clear();
    this.connected = state.connected;
    this.self = state.self;
    this.users = state.users;
    this.room = state.room;
  }

  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  emit(type, payload) {
    this.handlers.get(type)?.forEach(handler => handler(payload));
  }

  connectAndRegister(alias, loadoutId, characterId) {
    const socketOpen = this.socket?.readyState === WebSocket.OPEN;
    if (this.connected && this.self && socketOpen) return Promise.resolve(this.self);
    if (this.registerPromise) return this.registerPromise;
    if (!socketOpen && (this.connected || this.self || this.room || this.users.length)) this.clearState();
    let url;
    try {
      url = resolveWebSocketUrl(location, window.MYCF_WS_URL || import.meta.env?.VITE_MYCF_WS_URL);
    } catch (error) {
      return Promise.reject(error);
    }
    this.registerPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      let settled = false;
      const isCurrent = () => this.socket === socket;
      const timeout = window.setTimeout(() => {
        if (!isCurrent() || settled) return;
        settled = true;
        this.registerPromise = null;
        reject(networkError("CONNECTION_TIMEOUT", "Connection timed out."));
        socket.close();
      }, 8000);
      const cleanup = () => window.clearTimeout(timeout);
      socket.addEventListener("open", () => {
        if (!isCurrent()) return;
        this.connected = true;
        this.persistState();
        this.emit("status", { connected: true, code: "REGISTERING" });
        this.send("register", { alias, loadoutId, characterId });
      });
      socket.addEventListener("message", event => {
        if (!isCurrent()) return;
        let message;
        try { message = JSON.parse(event.data); } catch (error) { return; }
        const payload = message.payload || {};
        if (message.type === "registered") {
          cleanup();
          settled = true;
          this.registerPromise = null;
          this.self = payload.self;
          this.persistState();
          resolve(payload.self);
        }
        if (message.type === "presence") { this.users = payload.users || []; this.persistState(); }
        if (message.type === "room_state") { this.room = payload.room; this.persistState(); }
        if (message.type === "room_left") { this.room = null; this.persistState(); }
        if (message.type === "error" && !this.self) {
          cleanup();
          settled = true;
          this.registerPromise = null;
          reject(networkError(payload.code || "REGISTRATION_FAILED", payload.message || "Registration failed."));
          socket.close();
        }
        this.emit(message.type, payload);
      });
      socket.addEventListener("close", () => {
        if (!isCurrent()) return;
        cleanup();
        this.socket = null;
        this.registerPromise = null;
        this.clearState();
        if (!settled) {
          settled = true;
          reject(networkError("CONNECTION_CLOSED", "The multiplayer connection closed before registration completed."));
        }
        this.emit("status", { connected: false, code: "DISCONNECTED" });
      });
      socket.addEventListener("error", () => {
        if (isCurrent() && !this.self && !settled) {
          cleanup();
          settled = true;
          this.registerPromise = null;
          reject(networkError("CONNECTION_FAILED", "Unable to connect to the multiplayer server."));
          socket.close();
        }
      });
    });
    return this.registerPromise;
  }

  send(type, payload = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type, payload }));
    return true;
  }

  updateProfile(loadoutId, characterId) {
    if (this.self) {
      this.self = { ...this.self, loadoutId, characterId };
      this.persistState();
    }
    return this.send("update_profile", { loadoutId, characterId });
  }
  createRoom(settings) { this.send("create_room", settings); }
  invite(targetId) { this.send("invite", { targetId }); }
  respondInvite(roomId, accept) { this.send("respond_invite", { roomId, accept }); }
  leaveRoom({ clearProjection = false } = {}) {
    const sent = this.send("leave_room");
    if (clearProjection && this.room) {
      this.room = null;
      this.persistState();
    }
    return sent;
  }
  startRoom() { this.send("start_room"); }
  sendInput(input) { this.send("match_input", input); }
}
