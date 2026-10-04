import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { WebSocket } from "ws";

import health from "../api/health.js";
import { createGameServer } from "../src/runtime.js";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function helloFrom(url, options) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, options);
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error("WebSocket hello timed out"));
    }, 2000);
    socket.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
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

  await assert.rejects(
    helloFrom(`ws://127.0.0.1:${address.port}/ws`, { origin: "https://untrusted.example" }),
    /Unexpected server response: 403/,
  );
});

test("unregistered sockets time out and released connection capacity can be reused", async t => {
  const runtime = createGameServer({
    maxConnections: 2,
    maxConnectionsPerIp: 1,
    registrationTimeoutMs: 150,
  });
  const address = await listen(runtime.server);
  t.after(async () => {
    runtime.stop();
    await new Promise(resolve => runtime.server.close(resolve));
  });

  const url = `ws://127.0.0.1:${address.port}/ws`;
  const first = new WebSocket(url);
  await once(first, "open");
  await assert.rejects(helloFrom(url), /Unexpected server response: 429/);

  const [code, reason] = await once(first, "close");
  assert.equal(code, 1008);
  assert.equal(reason.toString(), "registration timeout");

  const hello = await helloFrom(url);
  assert.equal(hello.type, "hello");
});

test("Vercel configuration enables Fluid compute and rewrites the same-origin endpoint", async () => {
  const config = JSON.parse(await import("node:fs/promises").then(fs => fs.readFile(new URL("../vercel.json", import.meta.url), "utf8")));
  assert.equal(config.framework, null);
  assert.equal(config.fluid, true);
  assert.equal("buildCommand" in config, false);
  assert.equal("outputDirectory" in config, false);
  assert.deepEqual(config.rewrites, [
    { source: "/health", destination: "/api/health" },
    { source: "/ws", destination: "/api/ws" },
  ]);
  assert.equal(config.functions["api/ws.js"].maxDuration, 300);
});

test("the Vercel health function reports readiness without creating a game runtime", () => {
  const headers = new Map();
  let statusCode = 0;
  let body = "";
  const response = {
    setHeader(name, value) { headers.set(name, value); },
    set statusCode(value) { statusCode = value; },
    end(value) { body = value; },
  };

  health({}, response);

  assert.equal(statusCode, 200);
  assert.equal(headers.get("cache-control"), "no-store");
  assert.equal(headers.get("content-type"), "application/json; charset=utf-8");
  assert.deepEqual(JSON.parse(body), { ok: true, service: "toon-strike-ws" });
});
