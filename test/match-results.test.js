import assert from "node:assert/strict";
import test from "node:test";

import { alliedPodium, createMatchResult, summarizeActorStats } from "../src/config.js";

const actors = [
  { id: "seal-0", name: "Local", team: "seal", isPlayer: true, isBot: false, characterId: "glamAgentBlack", kills: 4, deaths: 2, damage: 350 },
  { id: "seal-1", name: "Ally", team: "seal", isBot: true, characterId: "cuteSoldier", kills: 6, deaths: 3, damage: 200 },
  { id: "terror-0", name: "Enemy", team: "terror", isBot: true, characterId: "specialForces", kills: 3, deaths: 7, damage: 500 },
];

test("scoreboard summaries include both team totals and the local K/D", () => {
  assert.deepEqual(summarizeActorStats(actors, "seal-0"), {
    teams: {
      seal: { kills: 10, deaths: 5 },
      terror: { kills: 3, deaths: 7 },
    },
    local: { kills: 4, deaths: 2 },
  });
});

test("match results preserve condition and character data for allied podium selection", () => {
  const condition = { id: "extended", killTarget: 30, timeLimit: 480 };
  const result = createMatchResult(actors, "seal", { seal: 10, terror: 3 }, condition);

  assert.deepEqual(
    { conditionId: result.conditionId, killTarget: result.killTarget, timeLimit: result.timeLimit },
    { conditionId: "extended", killTarget: 30, timeLimit: 480 },
  );
  assert.deepEqual(alliedPodium(result.rankings, "seal").map(entry => entry.name), ["Ally", "Local"]);
  assert.equal(result.rankings.find(entry => entry.name === "Local").characterId, "glamAgentBlack");
  assert.equal(result.rankings.find(entry => entry.name === "Local").isPlayer, true);
});

test("the allied podium is ordered by kills even when points favor another player", () => {
  const rankings = [
    { name: "Damage", team: "seal", kills: 2, deaths: 0, damage: 3000, points: 3200, rank: 1 },
    { name: "Fragger", team: "seal", kills: 8, deaths: 3, damage: 200, points: 970, rank: 2 },
    { name: "Support", team: "seal", kills: 5, deaths: 1, damage: 400, points: 890, rank: 3 },
    { name: "Enemy", team: "terror", kills: 20, deaths: 0, damage: 5000, points: 7000, rank: 4 },
  ];

  assert.deepEqual(alliedPodium(rankings, "seal").map(entry => entry.name), ["Fragger", "Support", "Damage"]);
});
