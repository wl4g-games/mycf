import assert from "node:assert/strict";
import test from "node:test";

import { LOADOUTS, MAPS, VEHICLE_TYPES, WEAPONS, isSolid } from "../src/config.js";
import { GameState } from "../src/game.js";
import { NetworkGameState } from "../src/network-game.js";
import { getVehicleRenderState } from "../src/renderer.js";
import {
  ACTOR_COLLISION_RADIUS, createVehicleStates, resolveInteractionVehicle, vehicleExitCandidates,
} from "../src/vehicle-system.js";

const silentAudio = new Proxy({}, { get: () => () => {} });

test("both maps expose a tank and an armored car at collision-safe spawn points", () => {
  for (const map of Object.values(MAPS)) {
    const vehicles = createVehicleStates(map);
    assert.deepEqual(vehicles.map(vehicle => vehicle.type), ["tank", "armoredCar"]);
    assert.equal(new Set(vehicles.map(vehicle => vehicle.id)).size, 2);
    for (const vehicle of vehicles) {
      const profile = VEHICLE_TYPES[vehicle.type];
      assert.equal(vehicle.health, profile.maxHealth);
      assert.ok(profile.interactKey && profile.exitKey && profile.hudDetailKey && profile.hudSlotKey);
      assert.ok(profile.weapon.nameKey && profile.weapon.modeKey && profile.weapon.ammoKey);
      assert.equal(isSolid(map, vehicle.x - profile.radius, vehicle.y - profile.radius), false);
      assert.equal(isSolid(map, vehicle.x + profile.radius, vehicle.y + profile.radius), false);
    }
  }
});

test("context selection is deterministic and safe exits cover both sides of a vehicle", () => {
  const vehicles = createVehicleStates(MAPS.city);
  vehicles[0].x = 10;
  vehicles[0].y = 10;
  vehicles[1].x = 10;
  vehicles[1].y = 10;
  const actor = { id: "pilot", x: 10, y: 10 };

  const selected = resolveInteractionVehicle(vehicles, actor);
  assert.equal(selected.id, [...vehicles].sort((left, right) => left.id.localeCompare(right.id))[0].id);
  const exits = vehicleExitCandidates(selected);
  assert.equal(exits.length, 8);
  assert.ok(exits.some(exit => exit.x > selected.x));
  assert.ok(exits.some(exit => exit.x < selected.x));
  assert.ok(exits.some(exit => exit.y > selected.y));
  assert.ok(exits.some(exit => exit.y < selected.y));
});

test("solo armored car entry, movement and machine-gun fire use generic vehicle state", () => {
  const events = [];
  const game = new GameState(silentAudio, (type, payload) => events.push({ type, payload }));
  const vehicle = game.armoredCar;
  game.player.x = vehicle.x;
  game.player.y = vehicle.y;
  game.player.angle = vehicle.angle;

  assert.equal(game.toggleVehicle(game.player, vehicle.id), true);
  assert.equal(game.currentVehicle, vehicle);
  assert.equal(game.tank.driverId, null);
  const before = { x: vehicle.x, y: vehicle.y };
  game.updatePlayer(.05, { x: 0, y: -1 }, true);

  assert.ok(Math.hypot(vehicle.x - before.x, vehicle.y - before.y) > 0);
  assert.equal(game.projectiles.some(projectile => projectile.type === "shell"), false);
  assert.equal(events.some(event => event.type === "shot" && event.payload.weaponId === "armoredMG"), true);
});

test("damage against an occupied vehicle contributes to attacker ranking damage", () => {
  const game = new GameState(silentAudio);
  const vehicle = game.tank;
  const driver = game.player;
  const attacker = game.actors.find(actor => actor.team !== driver.team);
  driver.x = vehicle.x;
  driver.y = vehicle.y;
  game.toggleVehicle(driver, vehicle.id);
  const beforeHealth = vehicle.health;
  const beforeDamage = attacker.damage;

  game.damage(driver, 40, attacker, "ak47");

  assert.ok(vehicle.health < beforeHealth);
  assert.ok(Math.abs((attacker.damage - beforeDamage) - (beforeHealth - vehicle.health)) < 1e-9);
});

test("vehicle exits choose an alternate clear side instead of releasing into a wall", () => {
  const game = new GameState(silentAudio);
  const vehicle = game.tank;
  vehicle.x = 15.5;
  vehicle.y = 24.2;
  vehicle.angle = 0;
  game.player.x = vehicle.x;
  game.player.y = vehicle.y;
  assert.equal(game.toggleVehicle(game.player, vehicle.id), true);

  assert.equal(game.toggleVehicle(game.player), true);
  assert.equal(vehicle.driverId, null);
  assert.ok(game.player.y < vehicle.y, "the blocked lower exit falls back to the clear upper side");
  assert.ok(Math.hypot(game.player.x - vehicle.x, game.player.y - vehicle.y) > ACTOR_COLLISION_RADIUS);
});

test("the network client targets the contextual vehicle and accepts canonical vehicle snapshots", () => {
  const packets = [];
  const client = {
    self: { id: "pilot-user", alias: "Pilot", loadoutId: "archer" },
    sendInput: packet => packets.push(packet),
  };
  const game = new NetworkGameState(client, silentAudio);
  game.start({
    room: { mapId: "city", modeId: "1v1" },
    assignment: { actorId: "seal-0", team: "seal" },
  });
  game.player.x = game.armoredCar.x;
  game.player.y = game.armoredCar.y;
  game.update(.05, {
    yaw: 0,
    pitch: 0,
    movement: { x: 0, y: 0 },
    fireHeld: false,
    items: [["interact"]],
  });

  assert.deepEqual(packets[0].actions, [["interact", game.armoredCar.id]]);
  const vehicles = createVehicleStates(MAPS.city);
  vehicles[1].driverId = game.player.id;
  vehicles[1].occupied = true;
  game.applySnapshot({
    mapId: "city",
    modeId: "1v1",
    conditionId: "standard",
    time: 299,
    score: { seal: 0, terror: 0 },
    finished: false,
    playerId: game.player.id,
    actors: [{ ...game.player }],
    vehicles,
    projectiles: [],
    effects: [],
    feed: [],
  });
  assert.equal(game.currentVehicle.id, vehicles[1].id);
  assert.equal(game.tank.id, vehicles[0].id);
});

test("the fourth loadout is fully backed by generic server weapon definitions", () => {
  assert.deepEqual(LOADOUTS.archer, {
    id: "archer",
    number: "04",
    nameKey: "loadout.archer.name",
    primary: "powerBow",
    secondary: "desertEagle",
    melee: "dualBlades",
    throwable: "smoke",
  });
  assert.equal(WEAPONS.powerBow.visual, "bow");
  assert.equal(WEAPONS.powerBow.automatic, false);
  assert.ok(WEAPONS.powerBow.damage > WEAPONS.ak47.damage);
  assert.equal(WEAPONS.desertEagle.visual, "pistol");
  assert.equal(WEAPONS.dualBlades.visual, "knife");
});

test("render state hides only the local vehicle and tracks every occupied driver", () => {
  const vehicles = createVehicleStates(MAPS.city);
  vehicles[0].driverId = "seal-0";
  vehicles[1].driverId = "terror-0";
  const state = getVehicleRenderState({ player: { id: "seal-0" }, vehicles });

  assert.equal(state.ownVehicle, vehicles[0]);
  assert.deepEqual([...state.driverIds].sort(), ["seal-0", "terror-0"]);
  assert.equal(state.vehicles.length, 2);
});
