import assert from "node:assert/strict";
import test from "node:test";

import { AuthoritativeMatch } from "../src/match.js";

test("authoritative human shot events include the stable weapon id", () => {
  const events = [];
  const match = new AuthoritativeMatch(
    { id: "SHOT01", mapId: "city", modeId: "4v4" },
    [{ id: "human-1", alias: "Alpha", loadoutId: "recon" }],
    event => events.push(event),
    () => {},
  );
  const actor = match.actorByUser.get("human-1");
  actor.cooldown = 0;

  match.attack(actor);
  match.attack(actor);

  assert.deepEqual(events.filter(event => event.type === "shot"), [{
    type: "shot",
    actorId: actor.id,
    userId: "human-1",
    weaponId: "barrett",
    profile: "sniper",
  }]);
});
