import assert from "node:assert/strict";
import test from "node:test";

import { browserOriginAllowed, requestIp } from "../src/access-policy.js";

function request(origin, host = "toon-strike.vercel.app") {
  return { headers: { origin, host }, socket: { remoteAddress: "127.0.0.1" } };
}

test("browser origins allow the Pages client, same-origin deployments, and local development", () => {
  assert.equal(browserOriginAllowed(request("https://wl4g-games.github.io")), true);
  assert.equal(browserOriginAllowed(request("https://mycf.wl4g.com")), true);
  assert.equal(browserOriginAllowed(request("https://toon-strike.vercel.app")), true);
  assert.equal(browserOriginAllowed(request("http://127.0.0.1:5173", "127.0.0.1:8787")), true);
});

test("browser origins reject unknown sites unless explicitly configured", () => {
  const unknown = request("https://untrusted.example");
  assert.equal(browserOriginAllowed(unknown), false);
  assert.equal(browserOriginAllowed(unknown, "https://untrusted.example"), true);
  assert.equal(browserOriginAllowed(request("null")), false);
  assert.equal(browserOriginAllowed(request("%%%")), false);
  assert.equal(browserOriginAllowed(request("http://127.0.0.1:5173")), false);
});

test("request IP extraction trusts a local reverse proxy but not a remote peer", () => {
  assert.equal(requestIp({
    headers: { "x-forwarded-for": "192.0.2.3, 10.0.0.2" },
    socket: { remoteAddress: "127.0.0.1" },
  }), "192.0.2.3");
  assert.equal(requestIp({
    headers: { "x-forwarded-for": "192.0.2.3" },
    socket: { remoteAddress: "198.51.100.7" },
  }), "198.51.100.7");
});
