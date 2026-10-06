import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  AudioCalloutPlayer, GRENADE_CALLOUT_ASSETS, resolveGrenadeCalloutAsset,
} from "../src/audio-callout.js";

test("packaged grenade callouts provide original English and Chinese audio assets", () => {
  assert.equal(resolveGrenadeCalloutAsset("en-US"), GRENADE_CALLOUT_ASSETS.en);
  assert.equal(resolveGrenadeCalloutAsset("zh-CN"), GRENADE_CALLOUT_ASSETS.zh);
  for (const url of Object.values(GRENADE_CALLOUT_ASSETS)) {
    const path = fileURLToPath(url);
    assert.equal(existsSync(path), true);
    assert.ok(statSync(path).size > 4000);
  }
});

test("callout player preloads, caches, and spatially plays decoded audio", async () => {
  const calls = { fetched: [], started: 0, pan: null, gain: null };
  const nodes = () => ({
    connect() { return this; },
  });
  const context = {
    decodeAudioData(encoded, resolve) {
      const buffer = { byteLength: encoded.byteLength };
      resolve(buffer);
      return Promise.resolve(buffer);
    },
    createBufferSource() {
      return {
        ...nodes(),
        buffer: null,
        start() { calls.started += 1; },
      };
    },
    createGain() {
      const node = nodes();
      node.gain = { value: 0 };
      calls.gain = node.gain;
      return node;
    },
    createStereoPanner() {
      const node = nodes();
      node.pan = { value: 0 };
      calls.pan = node.pan;
      return node;
    },
  };
  const player = new AudioCalloutPlayer({
    fetcher: async url => {
      calls.fetched.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    },
  });

  await player.preload(context);
  assert.equal(calls.fetched.length, 2);
  assert.equal(player.play(context, nodes(), { locale: "zh-CN", gain: .8, pan: -.65 }), true);
  assert.equal(calls.started, 1);
  assert.equal(calls.gain.value, .8);
  assert.equal(calls.pan.value, -.65);
  assert.equal(calls.fetched.length, 2);
});

test("callout player reports an asset failure so browser speech can take over", async () => {
  let failures = 0;
  const context = {
    decodeAudioData() { throw new Error("decode should not run"); },
  };
  const player = new AudioCalloutPlayer({
    fetcher: async () => ({ ok: false, status: 503 }),
  });

  assert.equal(player.play(context, {}, { onFailure: () => { failures += 1; } }), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failures, 1);
});
