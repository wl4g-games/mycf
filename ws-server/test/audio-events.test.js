import assert from "node:assert/strict";
import test from "node:test";

import { AuthoritativeMatch } from "../src/match.js";

test("authoritative grenade throws publish team, owner, and trajectory metadata", () => {
  const events = [];
  const match = new AuthoritativeMatch(
    { id: "AUDIO1", mapId: "city", modeId: "1v1" },
    [{ id: "human-1", alias: "Alpha", loadoutId: "raider" }],
    event => events.push(event),
    () => {},
  );
  const actor = match.actorByUser.get("human-1");
  actor.cooldown = 0;

  match.throwGrenade(actor);

  const event = events.find(item => item.type === "grenade_throw");
  assert.equal(event.projectileId, match.projectiles[0].id);
  assert.match(event.projectileId, /^AUDIO1-grenade-\d+$/);
  assert.equal(event.actorId, actor.id);
  assert.equal(event.userId, "human-1");
  assert.equal(event.team, actor.team);
  assert.equal(event.throwableId, "firework");
  assert.ok(Number.isFinite(event.from.x));
  assert.ok(Number.isFinite(event.to.x));
  assert.ok(Math.hypot(event.to.x - event.from.x, event.to.y - event.from.y) > 5);
});

test("authoritative tank fire publishes spatial metadata for remote presentation", () => {
  const events = [];
  const match = new AuthoritativeMatch(
    { id: "AUDIO2", mapId: "city", modeId: "1v1" },
    [{ id: "human-1", alias: "Alpha", loadoutId: "recon" }],
    event => events.push(event),
    () => {},
  );
  const actor = match.actorByUser.get("human-1");
  actor.x = match.tank.x;
  actor.y = match.tank.y;
  assert.equal(match.toggleVehicle(actor, match.tank.id), true);

  match.fireVehicle(actor);

  const event = events.find(item => item.type === "tank_shot");
  assert.equal(event.userId, "human-1");
  assert.equal(event.team, actor.team);
  assert.equal(event.vehicleId, match.tank.id);
  assert.ok(Number.isFinite(event.x));
  assert.ok(Number.isFinite(event.y));
});
