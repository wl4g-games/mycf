import assert from "node:assert/strict";
import test from "node:test";
import { AuthoritativeMatch } from "../src/match.js";

test("1v1 creates one actor per team and assigns two players to opposing sides", () => {
  const members = [
    { id: "duelist-a", alias: "Alpha", loadoutId: "recon" },
    { id: "duelist-b", alias: "Bravo", loadoutId: "raider" },
  ];
  const match = new AuthoritativeMatch(
    { id: "DUEL01", mapId: "city", modeId: "1v1" },
    members,
    () => {},
    () => {},
  );
  assert.equal(match.actors.length, 2);
  assert.equal(match.time, 300);
  assert.equal(match.actors.filter(actor => actor.isBot).length, 0);
  assert.deepEqual(members.map(member => match.assignmentFor(member.id).team), ["seal", "terror"]);
  assert.deepEqual(match.rules, { id: "standard", killTarget: 20, timeLimit: 300 });
});

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

test("the authoritative standard condition remains 300 wall-clock seconds during delayed ticks", () => {
  let now = 1000;
  let finished = null;
  const match = new AuthoritativeMatch(
    { id: "CLOCK1", mapId: "city", modeId: "1v1" },
    [{ id: "clock-user", alias: "Timer", loadoutId: "recon" }],
    () => {},
    result => { finished = result; },
    { now: () => now },
  );

  now += 299000;
  match.update(.05);
  assert.equal(match.time, 1);
  assert.equal(finished, null);

  now += 1000;
  match.update(.05);
  assert.equal(match.time, 0);
  assert.ok(finished);
});

test("the authoritative kill target comes only from a recognized condition id", () => {
  let finished = null;
  const match = new AuthoritativeMatch(
    { id: "RULE01", mapId: "city", modeId: "1v1", conditionId: "blitz", killTarget: 1, timeLimit: 1 },
    [{ id: "rule-user", alias: "Rules", loadoutId: "recon" }],
    () => {},
    result => { finished = result; },
  );
  const attacker = match.actors.find(actor => actor.team === "seal");
  const victim = match.actors.find(actor => actor.team === "terror");
  match.score.seal = 9;
  match.kill(victim, attacker, "barrett");

  assert.ok(finished);
  assert.deepEqual(
    { conditionId: finished.conditionId, killTarget: finished.killTarget, timeLimit: finished.timeLimit },
    { conditionId: "blitz", killTarget: 10, timeLimit: 180 },
  );
});

test("a targeted armored-car interaction tolerates bounded latency and fires its machine gun", () => {
  const events = [];
  const match = new AuthoritativeMatch(
    { id: "CAR001", mapId: "city", modeId: "1v1" },
    [{ id: "driver-1", alias: "Driver", loadoutId: "archer" }],
    event => events.push(event),
    () => {},
  );
  const actor = match.actorByUser.get("driver-1");
  const vehicle = match.armoredCar;
  actor.x = vehicle.x + 2.2;
  actor.y = vehicle.y;
  actor.angle = vehicle.angle;

  match.setInput("driver-1", {
    movement: { x: 0, y: -1 },
    angle: vehicle.angle,
    fireHeld: true,
    actions: [["interact", vehicle.id]],
  });
  match.update(.05);

  assert.equal(vehicle.driverId, actor.id);
  assert.equal(match.tank.driverId, null);
  assert.equal(match.projectiles.some(projectile => projectile.type === "shell"), false);
  assert.equal(events.some(event => event.type === "shot" && event.weaponId === "armoredMG"), true);
  const snapshot = match.snapshotFor("driver-1");
  assert.equal(snapshot.vehicles.length, 2);
  assert.equal(snapshot.vehicles.find(item => item.id === vehicle.id).driverId, actor.id);
  assert.equal(snapshot.tank.id, match.tank.id);
});

test("invalid remote vehicle targets cannot enter a different nearby vehicle", () => {
  const match = new AuthoritativeMatch(
    { id: "CAR002", mapId: "city", modeId: "1v1" },
    [{ id: "driver-1", alias: "Driver", loadoutId: "recon" }],
    () => {},
    () => {},
  );
  const actor = match.actorByUser.get("driver-1");
  actor.x = match.tank.x;
  actor.y = match.tank.y;

  assert.equal(match.toggleVehicle(actor, "missing-vehicle"), false);
  assert.equal(match.tank.driverId, null);
});

test("vehicle exit and pedestrian collision select a safe deterministic side", () => {
  const match = new AuthoritativeMatch(
    { id: "EXIT01", mapId: "city", modeId: "1v1" },
    [{ id: "driver-1", alias: "Driver", loadoutId: "recon" }],
    () => {},
    () => {},
  );
  const actor = match.actorByUser.get("driver-1");
  const vehicle = match.tank;
  vehicle.x = 15.5;
  vehicle.y = 24.2;
  vehicle.angle = 0;
  actor.x = vehicle.x;
  actor.y = vehicle.y;
  assert.equal(match.toggleVehicle(actor, vehicle.id), true);
  assert.equal(match.toggleVehicle(actor), true);
  assert.ok(actor.y < vehicle.y);

  const pedestrianX = match.armoredCar.x - 1;
  actor.x = pedestrianX;
  actor.y = match.armoredCar.y;
  match.moveEntity(actor, .4, 0, .24);
  assert.equal(actor.x, pedestrianX, "a pedestrian cannot walk through the armored car collision body");

  const blocker = match.actors.find(item => item !== actor);
  vehicle.x = 12;
  vehicle.y = 10;
  vehicle.driverId = actor.id;
  actor.x = vehicle.x;
  actor.y = vehicle.y;
  blocker.x = vehicle.x + 1;
  blocker.y = vehicle.y;
  match.moveVehicle(vehicle, .3, 0, .62);
  assert.equal(vehicle.x, 12, "a vehicle cannot clip through a living pedestrian");
});

test("occupied vehicle damage contributes to the authoritative attacker ranking", () => {
  const match = new AuthoritativeMatch(
    { id: "DMG001", mapId: "city", modeId: "1v1" },
    [{ id: "driver-1", alias: "Driver", loadoutId: "recon" }],
    () => {},
    () => {},
  );
  const driver = match.actorByUser.get("driver-1");
  const attacker = match.actors.find(actor => actor.team !== driver.team);
  driver.x = match.tank.x;
  driver.y = match.tank.y;
  assert.equal(match.toggleVehicle(driver, match.tank.id), true);
  const beforeHealth = match.tank.health;
  const beforeDamage = attacker.damage;

  match.damage(driver, 40, attacker, "ak47");

  assert.ok(match.tank.health < beforeHealth);
  assert.ok(Math.abs((attacker.damage - beforeDamage) - (beforeHealth - match.tank.health)) < 1e-9);
});
