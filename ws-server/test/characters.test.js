import assert from "node:assert/strict";
import test from "node:test";

import { CHARACTER_PROFILES, DEFAULT_CHARACTER_ID, botCharacterId } from "../src/game-config.js";
import { AuthoritativeMatch } from "../src/match.js";

test("authoritative snapshots and rankings preserve sanitized character profiles", () => {
  let result = null;
  const match = new AuthoritativeMatch(
    { id: "CHAR01", mapId: "city", modeId: "4v4" },
    [
      { id: "human-a", alias: "Alpha", loadoutId: "recon", characterId: "glamAgent" },
      { id: "human-b", alias: "Bravo", loadoutId: "police", characterId: "not-a-profile" },
    ],
    () => {},
    value => { result = value; },
  );

  assert.equal(match.actorByUser.get("human-a").characterId, "glamAgentBlack");
  assert.equal(match.actorByUser.get("human-b").characterId, DEFAULT_CHARACTER_ID);
  for (const actor of match.actors.filter(item => item.isBot)) {
    assert.equal(actor.characterId, botCharacterId(actor.team, actor.index));
  }

  const snapshot = match.snapshotFor("human-a");
  assert.ok(snapshot.actors.every(actor => CHARACTER_PROFILES[actor.characterId]));
  match.finish("seal");
  assert.ok(result.rankings.every(entry => CHARACTER_PROFILES[entry.characterId]));
  assert.equal(result.rankings.find(entry => entry.userId === "human-a").characterId, "glamAgentBlack");
  match.removeHuman("human-a");
  assert.equal(match.actors.find(actor => actor.id === snapshot.playerId).characterId, botCharacterId("seal", 0));
});
