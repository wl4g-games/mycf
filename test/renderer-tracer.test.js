import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BattlefieldEffects } from "../src/three/effects.js";
import { RenderResources, worldPoint } from "../src/three/resources.js";
import { verticalFov } from "../src/renderer.js";

const event = { type: "shot", actorId: "terror-0", profile: "rifle", from: { x: 0, y: 0, z: .68 }, to: { x: 8, y: 1, z: .58 }, hit: true, victimId: "seal-0" };
const game = { player: { id: "seal-0", scoped: false }, projectiles: [], effects: [] };

test("authoritative shots become finite world-space beams with directional incoming-hit colors", () => {
  const resources = new RenderResources();
  const effects = new BattlefieldEffects(new THREE.Scene(), resources);
  effects.trigger(event, game.player.id);
  effects.update(game, .01, new THREE.PerspectiveCamera());
  assert.equal(effects.beams.count, 1);
  const matrix = new THREE.Matrix4();
  effects.beams.getMatrixAt(0, matrix);
  assert.ok(matrix.elements.every(Number.isFinite));
  const position = new THREE.Vector3().setFromMatrixPosition(matrix);
  const expected = worldPoint(event.from).add(worldPoint(event.to)).multiplyScalar(.5);
  assert.ok(position.distanceTo(expected) < .00001);
  const color = new THREE.Color();
  effects.beams.getColorAt(0, color);
  assert.ok(color.r > color.g && color.r > color.b);
  effects.dispose(); resources.dispose();
});

test("effects have bounded GPU pools and expire without allocating more scene objects", () => {
  const resources = new RenderResources();
  const effects = new BattlefieldEffects(new THREE.Scene(), resources);
  const camera = new THREE.PerspectiveCamera();
  for (let i = 0; i < 200; i++) effects.trigger(event, game.player.id);
  effects.update(game, .01, camera);
  assert.equal(effects.beams.count, 96);
  effects.update(game, .3, camera);
  assert.equal(effects.beams.count, 0);
  assert.equal(effects.root.children.length, 4);
  effects.dispose(); resources.dispose();
});

test("horizontal FOV stays consistent across landscape and portrait perspective cameras", () => {
  for (const aspect of [16 / 9, 1, 390 / 844]) {
    const horizontal = Math.PI / 2.75;
    const vertical = verticalFov(horizontal, aspect) * Math.PI / 180;
    assert.ok(Math.abs(2 * Math.atan(Math.tan(vertical / 2) * aspect) - horizontal) < 1e-10);
  }
});
