import { createGameServer } from "./runtime.js";

const host = process.env.MYCF_WS_HOST || "127.0.0.1";
const port = Number(process.env.MYCF_WS_PORT || 8787);
const runtime = createGameServer({ staticRoot: process.env.MYCF_STATIC_ROOT });
const { server } = runtime;

function shutdown(signal) {
  runtime.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
  console.log(`[mycf-ws] ${signal}: shutting down`);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(port, host, () => {
  const mode = runtime.servesStatic ? "game + ws" : "ws";
  console.log(`[mycf-ws] ${mode} listening on http://${host}:${port}`);
});
