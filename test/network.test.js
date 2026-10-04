import assert from "node:assert/strict";
import test from "node:test";

import { resolveWebSocketUrl } from "../src/network.js";

const pagesLocation = new URL("https://wl4g-games.github.io/mycf/");

test("same-origin deployments use the shared WebSocket path", () => {
  assert.equal(resolveWebSocketUrl(new URL("https://toon-strike.vercel.app/")), "wss://toon-strike.vercel.app/ws");
  assert.equal(resolveWebSocketUrl(new URL("http://127.0.0.1:8787/")), "ws://127.0.0.1:8787/ws");
});

test("static Pages deployments require an explicit multiplayer endpoint", () => {
  assert.throws(() => resolveWebSocketUrl(pagesLocation), error => error.code === "WS_ENDPOINT_REQUIRED");
  assert.equal(
    resolveWebSocketUrl(pagesLocation, "https://toon-strike.vercel.app"),
    "wss://toon-strike.vercel.app/ws",
  );
});
