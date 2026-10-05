import http from "node:http";
import { WebSocketServer } from "ws";
import { browserOriginAllowed, requestIp } from "./access-policy.js";
import { MemoryCache } from "./cache/memory-cache.js";
import { GameStateStore } from "./game-state-store.js";
import { LobbyService } from "./lobby.js";

const DEFAULT_WEBSOCKET_PATHS = new Set(["/ws"]);
const MAX_CONNECTIONS = 256;
const MAX_CONNECTIONS_PER_IP = 8;
const REGISTRATION_TIMEOUT_MS = 10000;
const SHUTDOWN_SOCKET_GRACE_MS = 1000;

function rejectUpgrade(socket, status) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function closeWebSocket(socket, graceMs) {
  if (socket.readyState === 3) return Promise.resolve();
  return new Promise(resolve => {
    let timer = null;
    const finish = () => {
      if (timer) clearTimeout(timer);
      resolve();
    };
    socket.once("close", finish);
    timer = setTimeout(() => {
      if (socket.readyState !== 3) socket.terminate();
    }, graceMs);
    if (socket.readyState === 1) socket.close(1001, "server shutdown");
  });
}

export function createGameServer(options = {}) {
  const {
    websocketPaths = DEFAULT_WEBSOCKET_PATHS,
    allowedOrigins,
    maxConnections = MAX_CONNECTIONS,
    maxConnectionsPerIp = MAX_CONNECTIONS_PER_IP,
    registrationTimeoutMs = REGISTRATION_TIMEOUT_MS,
    shutdownSocketGraceMs = SHUTDOWN_SOCKET_GRACE_MS,
    cache: providedCache = null,
    stateStore: providedStateStore = null,
    closeCacheOnStop = providedCache === null && !providedStateStore?.cache,
    onPersistenceError = () => {},
  } = options;
  if (providedCache && providedStateStore?.cache && providedStateStore.cache !== providedCache) {
    throw new Error("The injected cache and state store must share the same cache backend.");
  }
  const cache = providedCache || providedStateStore?.cache || new MemoryCache();
  if (!providedCache && !providedStateStore?.cache) void cache.connect();
  if (!cache.isReady) throw new Error("The cache backend must be connected before the game server starts.");
  const stateStore = providedStateStore || new GameStateStore(cache);
  const lobby = new LobbyService({ stateStore, onPersistenceError });
  const allowedPaths = websocketPaths instanceof Set ? websocketPaths : new Set(websocketPaths);
  const connectionCounts = new Map();
  let stopping = false;
  const server = http.createServer((request, response) => {
    if (request.url === "/health") {
      const ready = !stopping && cache.isReady && !lobby.lastPersistenceError;
      response.writeHead(ready ? 200 : 503, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({
        ok: ready,
        users: lobby.clients.size,
        rooms: lobby.rooms.size,
        cache: { backend: cache.backend, ready: cache.isReady },
        persistence: { ready: !lobby.lastPersistenceError },
        now: Date.now(),
      }));
      return;
    }
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  const webSockets = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false });
  server.on("upgrade", (request, socket, head) => {
    let pathname = "";
    try { pathname = new URL(request.url, "http://localhost").pathname; } catch {}
    if (!allowedPaths.has(pathname)) {
      rejectUpgrade(socket, "404 Not Found");
      return;
    }
    if (stopping || !cache.isReady || lobby.lastPersistenceError) {
      rejectUpgrade(socket, "503 Service Unavailable");
      return;
    }
    if (!browserOriginAllowed(request, allowedOrigins)) {
      rejectUpgrade(socket, "403 Forbidden");
      return;
    }
    const ip = requestIp(request);
    if (webSockets.clients.size >= maxConnections) {
      rejectUpgrade(socket, "503 Service Unavailable");
      return;
    }
    if ((connectionCounts.get(ip) || 0) >= maxConnectionsPerIp) {
      rejectUpgrade(socket, "429 Too Many Requests");
      return;
    }
    webSockets.handleUpgrade(request, socket, head, webSocket => {
      request.clientIp = ip;
      webSockets.emit("connection", webSocket, request);
    });
  });

  webSockets.on("connection", (socket, request) => {
    const ip = request.clientIp || requestIp(request);
    connectionCounts.set(ip, (connectionCounts.get(ip) || 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const remaining = (connectionCounts.get(ip) || 1) - 1;
      if (remaining > 0) connectionCounts.set(ip, remaining);
      else connectionCounts.delete(ip);
    };
    socket.once("close", release);
    socket.isAlive = true;
    socket.on("pong", () => { socket.isAlive = true; });
    const client = lobby.connect(socket, request);
    const registrationTimer = setTimeout(() => {
      if (!client.alias) socket.close(1008, "registration timeout");
    }, registrationTimeoutMs);
    registrationTimer.unref();
    socket.once("close", () => clearTimeout(registrationTimer));
  });

  const gameLoop = setInterval(() => lobby.tick(), 50);
  const heartbeat = setInterval(() => {
    for (const socket of webSockets.clients) {
      if (!socket.isAlive) { socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30000);
  gameLoop.unref();
  heartbeat.unref();

  let stopPromise = null;
  const stop = () => {
    if (stopPromise) return stopPromise;
    stopping = true;
    clearInterval(gameLoop);
    clearInterval(heartbeat);
    lobby.beginShutdown();
    const sockets = [...webSockets.clients];
    stopPromise = Promise.resolve().then(async () => {
      await Promise.all(sockets.map(socket => closeWebSocket(socket, shutdownSocketGraceMs)));
      const errors = [];
      try { await lobby.flushPersistence(); } catch (error) { errors.push(error); }
      if (closeCacheOnStop) {
        try { await cache.close(); } catch (error) { errors.push(error); }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, "Server shutdown failed.");
    });
    return stopPromise;
  };
  server.once("close", () => { void stop().catch(onPersistenceError); });

  return { server, webSockets, lobby, cache, stateStore, stop };
}
