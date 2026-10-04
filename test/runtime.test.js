import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";

import health from "../api/health.js";
import { createGameServer } from "../server/runtime.js";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function helloFrom(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error("WebSocket hello timed out")), 2000);
    socket.once("error", reject);
    socket.once("message", raw => {
      clearTimeout(timeout);
      const message = JSON.parse(raw.toString());
      socket.close();
      resolve(message);
    });
  });
}

test("the portable server runtime accepts standalone and Vercel WebSocket paths", async t => {
  const runtime = createGameServer();
  const address = await listen(runtime.server);
  t.after(async () => {
    runtime.stop();
    await new Promise(resolve => runtime.server.close(resolve));
  });

  const origin = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${origin}/health`).then(response => response.json());
  assert.equal(health.ok, true);

  for (const path of ["/ws", "/api/ws"]) {
    const hello = await helloFrom(`ws://127.0.0.1:${address.port}${path}`);
    assert.equal(hello.type, "hello");
    assert.equal(hello.payload.protocol, 1);
  }
});

test("Vercel configuration enables Fluid compute and rewrites the same-origin endpoint", async () => {
  const config = JSON.parse(await import("node:fs/promises").then(fs => fs.readFile(new URL("../vercel.json", import.meta.url), "utf8")));
  assert.equal(config.framework, "vite");
  assert.equal(config.fluid, true);
  assert.deepEqual(config.rewrites, [
    { source: "/health", destination: "/api/health" },
    { source: "/ws", destination: "/api/ws" },
  ]);
  assert.equal(config.functions["api/ws.js"].maxDuration, 300);
});

test("the Vercel health function reports readiness without creating a game runtime", () => {
  const headers = new Map();
  let statusCode = 0;
  let payload = null;
  const response = {
    setHeader(name, value) { headers.set(name, value); },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; },
  };

  health({}, response);

  assert.equal(statusCode, 200);
  assert.equal(headers.get("cache-control"), "no-store");
  assert.deepEqual(payload, { ok: true, service: "toon-strike" });
});
