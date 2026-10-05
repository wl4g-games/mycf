import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { fullscreenElement, supportsFullscreen, toggleFullscreen } from "../src/fullscreen.js";

test("fullscreen helpers enter and exit with the standard API", async () => {
  const documentValue = {
    fullscreenElement: null,
    async exitFullscreen() { this.fullscreenElement = null; },
  };
  const target = {
    async requestFullscreen() { documentValue.fullscreenElement = target; },
  };

  assert.equal(supportsFullscreen(documentValue, target), true);
  assert.equal(fullscreenElement(documentValue), null);
  assert.deepEqual(await toggleFullscreen(documentValue, target), {
    active: true,
    supported: true,
    changed: true,
  });
  assert.equal(fullscreenElement(documentValue), target);
  assert.deepEqual(await toggleFullscreen(documentValue, target), {
    active: false,
    supported: true,
    changed: true,
  });
});

test("fullscreen helpers support WebKit-prefixed APIs", async () => {
  const documentValue = {
    webkitFullscreenElement: null,
    async webkitExitFullscreen() { this.webkitFullscreenElement = null; },
  };
  const target = {
    async webkitRequestFullScreen() { documentValue.webkitFullscreenElement = target; },
  };

  assert.equal(supportsFullscreen(documentValue, target), true);
  await toggleFullscreen(documentValue, target);
  assert.equal(fullscreenElement(documentValue), target);
  await toggleFullscreen(documentValue, target);
  assert.equal(fullscreenElement(documentValue), null);
});

test("fullscreen helpers fail gracefully when the API is missing or rejects", async () => {
  assert.equal(supportsFullscreen({}, {}), false);
  assert.deepEqual(await toggleFullscreen({}, {}), {
    active: false,
    supported: false,
    changed: false,
  });

  const documentValue = { fullscreenElement: null, async exitFullscreen() {} };
  const target = { async requestFullscreen() { throw new Error("denied"); } };
  assert.deepEqual(await toggleFullscreen(documentValue, target), {
    active: false,
    supported: true,
    changed: false,
  });
});

test("fullscreen support respects browser and permissions-policy disablement", () => {
  const standardDocument = { fullscreenEnabled: false, exitFullscreen() {} };
  const standardTarget = { requestFullscreen() {} };
  assert.equal(supportsFullscreen(standardDocument, standardTarget), false);

  const webkitDocument = { webkitFullscreenEnabled: false, webkitExitFullscreen() {} };
  const webkitTarget = { webkitRequestFullScreen() {} };
  assert.equal(supportsFullscreen(webkitDocument, webkitTarget), false);
});

test("battle controls require an explicit confirmation action", () => {
  const markup = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(markup, /id="fullscreen-button"/);
  assert.match(markup, /id="force-button"/);
  assert.match(markup, /id="force-modal"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(markup, /id="force-cancel"/);
  assert.match(markup, /id="force-confirm"/);
  assert.match(markup, /class="battle-controls"[^>]*aria-live="off"/);
  assert.match(source, /event\.code === "KeyX"/);
  assert.match(source, /event\.code === "KeyR"/);
  assert.match(styles, /\.battle-control\{[^}]*min-width:44px;min-height:44px/);
  assert.match(styles, /safe-area-inset-(?:top|right)/);
  assert.match(styles, /\.dialog-layer\{[^}]*inset:0[^}]*pointer-events:auto/);
});
