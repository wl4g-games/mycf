import http from "node:http";
import { WebSocketServer } from "ws";
import { browserOriginAllowed, requestIp } from "./access-policy.js";
import { LobbyService } from "./lobby.js";

const DEFAULT_WEBSOCKET_PATHS = new Set(["/ws"]);
const MAX_CONNECTIONS = 256;
const MAX_CONNECTIONS_PER_IP = 8;
const REGISTRATION_TIMEOUT_MS = 10000;

function rejectUpgrade(socket, status) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export function createGameServer({
  websocketPaths = DEFAULT_WEBSOCKET_PATHS,
  allowedOrigins,
  maxConnections = MAX_CONNECTIONS,
  maxConnectionsPerIp = MAX_CONNECTIONS_PER_IP,
  registrationTimeoutMs = REGISTRATION_TIMEOUT_MS,
} = {}) {
  const lobby = new LobbyService();
  const allowedPaths = websocketPaths instanceof Set ? websocketPaths : new Set(websocketPaths);
  const connectionCounts = new Map();
  const server = http.createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ ok: true, users: lobby.clients.size, rooms: lobby.rooms.size, now: Date.now() }));
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

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(gameLoop);
    clearInterval(heartbeat);
    for (const socket of webSockets.clients) socket.close(1001, "server shutdown");
  };
  server.once("close", stop);

  return { server, webSockets, lobby, stop };
}
