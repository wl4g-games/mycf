import assert from "node:assert/strict";
import test from "node:test";

import { NetworkClient, resolveWebSocketUrl } from "../src/network.js";

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

test("a failed registration cannot let its stale socket corrupt a retry", async t => {
  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances = [];

    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.listeners = new Map();
      this.sent = [];
      FakeWebSocket.instances.push(this);
    }

    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(handler);
    }

    dispatch(type, event = {}) {
      this.listeners.get(type)?.forEach(handler => handler(event));
    }

    open() {
      this.readyState = FakeWebSocket.OPEN;
      this.dispatch("open");
    }

    message(value) {
      this.dispatch("message", { data: JSON.stringify(value) });
    }

    send(raw) { this.sent.push(JSON.parse(raw)); }

    close() {
      this.readyState = FakeWebSocket.CLOSING;
    }
  }

  const descriptors = {
    WebSocket: Object.getOwnPropertyDescriptor(globalThis, "WebSocket"),
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    location: Object.getOwnPropertyDescriptor(globalThis, "location"),
  };
  Object.defineProperties(globalThis, {
    WebSocket: { configurable: true, value: FakeWebSocket },
    window: { configurable: true, value: { MYCF_WS_URL: "ws://127.0.0.1:8787/ws", setTimeout, clearTimeout } },
    location: { configurable: true, value: new URL("https://wl4g-games.github.io/mycf/") },
  });
  t.after(() => {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  const client = new NetworkClient();
  const firstAttempt = client.connectAndRegister("Alpha", "recon", "glamAgentBlack");
  const firstSocket = FakeWebSocket.instances[0];
  firstSocket.open();
  assert.deepEqual(firstSocket.sent.at(-1), {
    type: "register",
    payload: { alias: "Alpha", loadoutId: "recon", characterId: "glamAgentBlack" },
  });
  firstSocket.message({ type: "error", payload: { code: "ALIAS_TAKEN", message: "Taken" } });
  await assert.rejects(firstAttempt, error => error.code === "ALIAS_TAKEN");

  const secondAttempt = client.connectAndRegister("Bravo", "recon", "cuteSoldier");
  const secondSocket = FakeWebSocket.instances[1];
  secondSocket.open();
  firstSocket.readyState = FakeWebSocket.CLOSED;
  firstSocket.dispatch("close");
  assert.equal(client.connected, true);
  assert.equal(client.socket, secondSocket);

  secondSocket.message({ type: "registered", payload: { self: { id: "second", alias: "Bravo" } } });
  assert.deepEqual(await secondAttempt, { id: "second", alias: "Bravo" });
  assert.equal(client.connected, true);
  assert.equal(client.self.alias, "Bravo");
  client.updateProfile("archer", "qipaoAgent");
  assert.deepEqual(secondSocket.sent.at(-1), {
    type: "update_profile",
    payload: { loadoutId: "archer", characterId: "qipaoAgent" },
  });
});
