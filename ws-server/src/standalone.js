import { createCache } from "./cache/cache-factory.js";
import { createGameServer } from "./runtime.js";

const host = process.env.MYCF_WS_HOST || "127.0.0.1";
const port = Number(process.env.PORT || process.env.MYCF_WS_PORT || 8787);
const reportCacheError = error => {
  console.error(`[mycf-ws] cache error: ${error?.message || "unknown error"}`);
};
const cache = await createCache({ onError: reportCacheError }).catch(error => {
  console.error(`[mycf-ws] cache startup failed: ${error?.message || "unknown error"}`);
  process.exit(1);
});
const runtime = createGameServer({
  cache,
  closeCacheOnStop: true,
  onPersistenceError: reportCacheError,
});
const { server } = runtime;

let shutdownPromise = null;
function shutdown(signal) {
  if (shutdownPromise) return shutdownPromise;
  console.log(`[mycf-ws] ${signal}: shutting down`);
  shutdownPromise = (async () => {
    const serverClosed = new Promise(resolve => server.close(resolve));
    await runtime.stop();
    await serverClosed;
  })();
  const timeout = setTimeout(() => process.exit(1), 5000);
  timeout.unref();
  shutdownPromise.then(
    () => {
      clearTimeout(timeout);
      process.exit(0);
    },
    error => {
      console.error(`[mycf-ws] shutdown failed: ${error?.message || "unknown error"}`);
      process.exit(1);
    },
  );
  return shutdownPromise;
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(port, host, () => {
  console.log(`[mycf-ws] listening on http://${host}:${port} with ${cache.backend} cache`);
});
