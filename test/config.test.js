import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CONDITION_ID, GAME_MODES, LOADOUTS, MAPS, MATCH_CONDITIONS, MATCH_CONDITION_IDS, MATCH_TIME, spawnCells,
} from "../src/config.js";

test("the game exposes two maps, four team sizes, four loadouts and fixed match conditions", () => {
  assert.deepEqual(Object.keys(MAPS), ["city", "wild"]);
  assert.equal(DEFAULT_CONDITION_ID, "standard");
  assert.equal(MATCH_TIME, 300);
  assert.deepEqual(MATCH_CONDITION_IDS, ["blitz", "standard", "extended", "marathon"]);
  assert.deepEqual(
    MATCH_CONDITION_IDS.map(id => MATCH_CONDITIONS[id]),
    [
      { id: "blitz", killTarget: 10, timeLimit: 180 },
      { id: "standard", killTarget: 20, timeLimit: 300 },
      { id: "extended", killTarget: 30, timeLimit: 480 },
      { id: "marathon", killTarget: 50, timeLimit: 720 },
    ],
  );
  assert.deepEqual(Object.keys(GAME_MODES), ["1v1", "4v4", "8v8", "16v16"]);
  assert.deepEqual(GAME_MODES["1v1"], { id: "1v1", label: "1 VS 1", teamSize: 1 });
  assert.ok(Object.values(GAME_MODES).every(mode => !("scoreLimit" in mode)));
  assert.deepEqual(Object.keys(LOADOUTS), ["recon", "raider", "police", "archer"]);
  assert.deepEqual(
    { primary: LOADOUTS.archer.primary, secondary: LOADOUTS.archer.secondary, melee: LOADOUTS.archer.melee, throwable: LOADOUTS.archer.throwable },
    { primary: "powerBow", secondary: "desertEagle", melee: "dualBlades", throwable: "smoke" },
  );
  for (const map of Object.values(MAPS)) {
    assert.ok(spawnCells(map, "seal").length >= 16);
    assert.ok(spawnCells(map, "terror").length >= 16);
  }
});
