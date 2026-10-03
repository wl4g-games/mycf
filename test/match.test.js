import assert from "node:assert/strict";
import test from "node:test";
import { AuthoritativeMatch } from "../server/match.js";

test("an underfilled 4v4 match creates balanced AI replacements and rankings", () => {
  let finished = null;
  const match = new AuthoritativeMatch(
    { id: "ROOM01", mapId: "city", modeId: "4v4" },
    [{ id: "human-1", alias: "Alpha", loadoutId: "recon" }],
    () => {},
    result => { finished = result; },
  );
  assert.equal(match.actors.length, 8);
  assert.equal(match.actors.filter(actor => !actor.isBot).length, 1);
  assert.equal(match.actors.filter(actor => actor.isBot).length, 7);
  assert.deepEqual(match.assignmentFor("human-1"), { actorId: "seal-0", team: "seal" });
  const actor = match.actorByUser.get("human-1");
  const before = { x: actor.x, y: actor.y };
  match.setInput("human-1", { movement: { x: 1, y: 0 }, angle: actor.angle, fireHeld: false, actions: [] });
  for (let index = 0; index < 20; index += 1) match.update(.05);
  assert.ok(Math.hypot(actor.x - before.x, actor.y - before.y) > .05);
  actor.kills = 3;
  actor.damage = 420;
  match.finish("seal");
  assert.equal(finished.rankings.length, 8);
  assert.equal(finished.rankings[0].name, "Alpha");
  assert.equal(finished.rankings[0].rank, 1);
});

test("a network player can drive the tank and fire while moving", () => {
  const match = new AuthoritativeMatch(
    { id: "TANK01", mapId: "wild", modeId: "4v4" },
    [{ id: "driver-1", alias: "Driver", loadoutId: "police" }],
    () => {},
    () => {},
  );
  const actor = match.actorByUser.get("driver-1");
  actor.x = match.tank.x;
  actor.y = match.tank.y;
  const before = { x: match.tank.x, y: match.tank.y };
  match.setInput("driver-1", { movement: { x: 0, y: -1 }, angle: match.tank.angle, fireHeld: true, actions: [["interact"]] });
  match.update(.05);
  assert.equal(match.tank.driverId, actor.id);
  assert.ok(Math.hypot(match.tank.x - before.x, match.tank.y - before.y) > 0);
  assert.equal(match.projectiles.filter(projectile => projectile.type === "shell").length, 1);
});

test("16v16 creates 32 actors and alternates human team assignments", () => {
  const members = Array.from({ length: 5 }, (_, index) => ({ id: `u-${index}`, alias: `User${index}`, loadoutId: "recon" }));
  const match = new AuthoritativeMatch({ id: "BIG001", mapId: "city", modeId: "16v16" }, members, () => {}, () => {});
  assert.equal(match.actors.length, 32);
  assert.deepEqual(members.map(member => match.assignmentFor(member.id).team), ["seal", "terror", "seal", "terror", "seal"]);
  assert.equal(match.actors.filter(actor => actor.isBot).length, 27);
});
