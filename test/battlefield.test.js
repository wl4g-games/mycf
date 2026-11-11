import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { MAPS } from "../src/config.js";
import { Battlefield, mapRectangles } from "../src/three/world.js";
import { TestRenderResources } from "./support/render-resources.js";

test("merged map footprints cover each solid collision cell exactly once", () => {
  for (const map of Object.values(MAPS)) {
    const covered = new Set();
    for (const rect of mapRectangles(map.grid)) {
      for (let z = rect.z; z < rect.z + rect.depth; z++) for (let x = rect.x; x < rect.x + rect.width; x++) {
        const key = `${x}:${z}`;
        assert.equal(covered.has(key), false);
        assert.equal(map.grid[z][x], rect.tile);
        covered.add(key);
      }
    }
    const solidCount = map.grid.join("").replaceAll(".", "").length;
    assert.equal(covered.size, solidCount);
  }
});

test("both battlefields batch geometry and BVH raycasts stop against real cover", () => {
  const resources = new TestRenderResources();
  for (const map of Object.values(MAPS)) {
    const world = new Battlefield(map, resources);
    assert.ok(world.root.children.length < 40);
    assert.ok(world.root.children.every(object => object.isInstancedMesh));
    const ray = new THREE.Raycaster(new THREE.Vector3(3.75, 1.7, 3.75), new THREE.Vector3(-1, 0, 0), 0, 20);
    ray.firstHitOnly = true;
    const hit = ray.intersectObject(world.collider)[0];
    assert.ok(hit && hit.distance < 2);
    let disposed = false;
    world.collider.geometry.addEventListener("dispose", () => { disposed = true; });
    world.dispose();
    assert.equal(disposed, true);
    assert.equal(world.root.children.length, 0);
  }
  resources.dispose();
});
