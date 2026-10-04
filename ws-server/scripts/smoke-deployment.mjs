import { WebSocket } from "ws";

const deploymentUrl = new URL(process.argv[2] || "");
if (deploymentUrl.protocol === "ws:") deploymentUrl.protocol = "http:";
if (deploymentUrl.protocol === "wss:") deploymentUrl.protocol = "https:";
if (!new Set(["http:", "https:"]).has(deploymentUrl.protocol)) {
  throw new Error("Deployment URL must use HTTP, HTTPS, WS, or WSS.");
}
const browserOrigin = process.argv[3] || "https://wl4g-games.github.io";
const healthUrl = new URL("/health", deploymentUrl);
const socketUrl = new URL("/ws", deploymentUrl);
socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";

const healthResponse = await fetch(healthUrl, {
  headers: { accept: "application/json" },
  signal: AbortSignal.timeout(10_000),
});
if (!healthResponse.ok) {
  throw new Error(`Health check failed with HTTP ${healthResponse.status}.`);
}
const health = await healthResponse.json();
if (health?.ok !== true) {
  throw new Error("Health check returned an unexpected response.");
}

await new Promise((resolve, reject) => {
  const socket = new WebSocket(socketUrl, { origin: browserOrigin });
  const timeout = setTimeout(() => {
    socket.terminate();
    reject(new Error("WebSocket handshake timed out."));
  }, 10_000);

  socket.once("message", data => {
    try {
      const message = JSON.parse(String(data));
      if (message.type !== "hello") {
        throw new Error(`Expected hello, received ${String(message.type || "unknown")}.`);
      }
      clearTimeout(timeout);
      socket.close();
      resolve();
    } catch (error) {
      clearTimeout(timeout);
      socket.terminate();
      reject(error);
    }
  });
  socket.once("error", error => {
    clearTimeout(timeout);
    reject(error);
  });
});

console.log("Vercel health and cross-origin WebSocket smoke checks passed.");
