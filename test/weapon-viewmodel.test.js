import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createWeapon, SoldierModel, VehicleModel } from "../src/three/models.js";
import { FirstPersonWeapon } from "../src/three/viewmodel.js";
import { WEAPONS } from "../src/config.js";
import { TestRenderResources } from "./support/render-resources.js";
import { ModelBatch } from "../src/three/model-batch.js";

test("every loadout weapon has a real mesh and a forward muzzle", () => {
  const resources = new TestRenderResources();
  for (const id of Object.keys(WEAPONS)) {
    const model = createWeapon(resources, id);
    assert.ok(model.root.children.some(child => child.isMesh));
    assert.ok(model.muzzle.position.z < 0);
  }
  resources.dispose();
});

test("accepted shots drive 3D recoil, flash, bow release and melee swing independently", () => {
  const resources = new TestRenderResources();
  const view = new FirstPersonWeapon(resources);
  const game = { player: { weaponId: "ak47", alive: true }, currentVehicle: null };
  view.triggerShot({ weaponId: "ak47" });
  view.update(game, {}, .01, 16 / 9);
  assert.ok(view.kick > 0);
  assert.equal(view.flash.visible, true);
  view.update(game, {}, .1, 16 / 9);
  assert.equal(view.flash.visible, false);
  for (const id of ["swiss", "axe", "dualBlades", "powerBow"]) {
    view.triggerShot({ weaponId: id });
    assert.equal(view.kick, 0);
    assert.equal(view.flashTime, 0);
    assert.equal(view.swing, 1);
  }
  view.dispose(); resources.dispose();
});

test("scopes hide the model and portrait layouts retain finite projection and shared resources", () => {
  const resources = new TestRenderResources();
  const view = new FirstPersonWeapon(resources);
  const game = { player: { weaponId: "barrett", alive: true, scoped: true } };
  view.update(game, {}, .01, 390 / 844);
  assert.equal(view.scene.visible, false);
  game.player.scoped = false;
  view.update(game, {}, 0, 390 / 844);
  assert.equal(view.scene.visible, true);
  const before = view.root.position.clone();
  view.update(game, {}, 0, 390 / 844);
  assert.deepEqual(view.root.position, before);
  view.scene.updateMatrixWorld(true);
  const muzzle = view.model.muzzle.getWorldPosition(new THREE.Vector3()).project(view.camera);
  assert.ok(Math.abs(muzzle.x) < 1 && Math.abs(muzzle.y) < 1);
  for (const id of Object.keys(WEAPONS)) view.setWeapon(id);
  const geometryCount = resources.geometries.size;
  for (const id of Object.keys(WEAPONS)) view.setWeapon(id);
  assert.equal(resources.geometries.size, geometryCount);
  view.dispose(); resources.dispose();
});

test("soldiers have articulated gait and independent vehicle turrets track authoritative yaw", () => {
  const resources = new TestRenderResources();
  const actor = { characterId: "maleAgent", weaponId: "ak47", team: "seal", x: 2, y: 3, angle: 0 };
  const model = new SoldierModel(resources, actor);
  model.update(actor, { phase: Math.PI / 2, activity: 1 });
  assert.ok(model.legs[0].hip.rotation.x > 0);
  assert.ok(model.legs[1].hip.rotation.x < 0);
  assert.equal(model.root.position.x, 5);
  for (const type of ["tank", "armoredCar"]) {
    const vehicle = new VehicleModel(resources, type);
    vehicle.update({ x: 2, y: 3, angle: .4, turretAngle: 1, speed: 2 }, .02);
    assert.ok(Math.abs(vehicle.turret.rotation.y + .6) < 1e-10);
    assert.ok(vehicle.wheels.length >= 4);
  }
  resources.dispose();
});

test("32 articulated soldiers share draw batches and updates reuse the existing GPU buffers", () => {
  const resources = new TestRenderResources();
  const models = Array.from({ length: 32 }, (_, index) => {
    const actor = { characterId: "maleAgent", weaponId: "ak47", team: index % 2 ? "seal" : "terror", x: index, y: 2, angle: 0 };
    const model = new SoldierModel(resources, actor);
    model.update(actor, { phase: index, activity: 1 });
    return model;
  });
  const batches = new ModelBatch();
  batches.update(models);
  assert.ok(batches.root.children.length < 30);
  const buffers = [...batches.batches.values()].map(batch => batch.mesh.instanceMatrix.array);
  batches.update(models);
  assert.deepEqual([...batches.batches.values()].map(batch => batch.mesh.instanceMatrix.array), buffers);
  batches.update([]);
  assert.ok([...batches.batches.values()].every(batch => batch.mesh.count === 0));
  batches.dispose(); resources.dispose();
});
