export class NetworkClient {
  constructor() {
    this.socket = null;
    this.handlers = new Map();
    this.self = null;
    this.room = null;
    this.users = [];
    this.connected = false;
    this.registerPromise = null;
  }

  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  emit(type, payload) {
    this.handlers.get(type)?.forEach(handler => handler(payload));
  }

  connectAndRegister(alias, loadoutId) {
    if (this.registerPromise) return this.registerPromise;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const pagesUrl = location.hostname.endsWith(".github.io") ? "wss://mycf.wl4g.com/ws" : null;
    const url = window.MYCF_WS_URL || pagesUrl || `${protocol}//${location.host}/ws`;
    this.registerPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      const timeout = window.setTimeout(() => {
        this.registerPromise = null;
        reject(new Error("连接超时，请检查网络后重试"));
        socket.close();
      }, 8000);
      const cleanup = () => window.clearTimeout(timeout);
      socket.addEventListener("open", () => {
        this.connected = true;
        this.emit("status", { connected: true, message: "已连接，正在注册…" });
        this.send("register", { alias, loadoutId });
      });
      socket.addEventListener("message", event => {
        let message;
        try { message = JSON.parse(event.data); } catch (error) { return; }
        const payload = message.payload || {};
        if (message.type === "registered") {
          cleanup();
          this.self = payload.self;
          resolve(payload.self);
        }
        if (message.type === "presence") this.users = payload.users || [];
        if (message.type === "room_state") this.room = payload.room;
        if (message.type === "room_left") this.room = null;
        if (message.type === "error" && !this.self) {
          cleanup();
          this.registerPromise = null;
          reject(new Error(payload.message || "注册失败"));
        }
        this.emit(message.type, payload);
      });
      socket.addEventListener("close", () => {
        cleanup();
        this.connected = false;
        this.registerPromise = null;
        this.emit("status", { connected: false, message: "与服务器的连接已断开" });
      });
      socket.addEventListener("error", () => {
        if (!this.self) {
          cleanup();
          this.registerPromise = null;
          reject(new Error("无法连接多人服务器"));
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

  updateProfile(loadoutId) { this.send("update_profile", { loadoutId }); }
  createRoom(settings) { this.send("create_room", settings); }
  invite(targetId) { this.send("invite", { targetId }); }
  respondInvite(roomId, accept) { this.send("respond_invite", { roomId, accept }); }
  leaveRoom() { this.send("leave_room"); }
  startRoom() { this.send("start_room"); }
  sendInput(input) { this.send("match_input", input); }
}
