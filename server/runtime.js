import http from "node:http";
import { WebSocketServer } from "ws";
import { LobbyService } from "./lobby.js";
import { createStaticHandler } from "./static.js";

const DEFAULT_WEBSOCKET_PATHS = new Set(["/ws", "/api/ws"]);

export function createGameServer({ staticRoot, websocketPaths = DEFAULT_WEBSOCKET_PATHS } = {}) {
  const lobby = new LobbyService();
  const serveStatic = createStaticHandler(staticRoot);
  const allowedPaths = websocketPaths instanceof Set ? websocketPaths : new Set(websocketPaths);
  const server = http.createServer(async (request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ ok: true, users: lobby.clients.size, rooms: lobby.rooms.size, now: Date.now() }));
      return;
    }
    if (serveStatic && await serveStatic(request, response)) return;
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  const webSockets = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false });
  server.on("upgrade", (request, socket, head) => {
    let pathname = "";
    try { pathname = new URL(request.url, "http://localhost").pathname; } catch (error) {}
    if (!allowedPaths.has(pathname)) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, webSocket => webSockets.emit("connection", webSocket, request));
  });

  webSockets.on("connection", (socket, request) => {
    socket.isAlive = true;
    socket.on("pong", () => { socket.isAlive = true; });
    lobby.connect(socket, request);
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

  return { server, webSockets, lobby, stop, servesStatic: Boolean(serveStatic) };
}
