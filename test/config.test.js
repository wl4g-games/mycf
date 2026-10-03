import assert from "node:assert/strict";
import test from "node:test";
import { GAME_MODES, LOADOUTS, MAPS, spawnCells } from "../src/config.js";

test("the restored game exposes exactly two maps, three team sizes and three backpacks", () => {
  assert.deepEqual(Object.keys(MAPS), ["city", "wild"]);
  assert.deepEqual(Object.keys(GAME_MODES), ["4v4", "8v8", "16v16"]);
  assert.deepEqual(Object.keys(LOADOUTS), ["recon", "raider", "police"]);
  for (const map of Object.values(MAPS)) {
    assert.ok(spawnCells(map, "seal").length >= 16);
    assert.ok(spawnCells(map, "terror").length >= 16);
  }
});
