import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import { WORLD_SCALE as S, noise } from "./resources.js";

// Merge contiguous solid cells so walls, AI navigation and visual cover share a footprint.
export function mapRectangles(grid) {
  const visited = new Set();
  const rectangles = [];
  for (let z = 0; z < grid.length; z++) for (let x = 0; x < grid[z].length; x++) {
    const tile = grid[z][x];
    if (tile === "." || visited.has(`${x}:${z}`)) continue;
    let width = 1;
    while (grid[z][x + width] === tile && !visited.has(`${x + width}:${z}`)) width++;
    let depth = 1;
    while (grid[z + depth] && Array.from({ length: width }, (_, dx) => grid[z + depth][x + dx] === tile && !visited.has(`${x + dx}:${z + depth}`)).every(Boolean)) depth++;
    for (let dz = 0; dz < depth; dz++) for (let dx = 0; dx < width; dx++) visited.add(`${x + dx}:${z + dz}`);
    rectangles.push({ x, z, width, depth, tile });
  }
  return rectangles;
}

class StaticBatch {
  constructor(resources, root) { this.resources = resources; this.root = root; this.batches = new Map(); }
  add(kind, material, position, scale, rotation = [0, 0, 0]) {
    const key = `${kind}:${material.uuid}`;
    if (!this.batches.has(key)) this.batches.set(key, { kind, material, instances: [] });
    this.batches.get(key).instances.push({ position, scale, rotation });
  }
  finish() {
    const transform = new THREE.Object3D();
    for (const { kind, material, instances } of this.batches.values()) {
      const mesh = new THREE.InstancedMesh(this.resources.geometry(kind), material, instances.length);
      instances.forEach((item, index) => {
        transform.position.set(...item.position); transform.scale.set(...item.scale); transform.rotation.set(...item.rotation);
        transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
      });
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.root.add(mesh);
    }
    this.root.traverse(object => { object.updateMatrix(); object.matrixAutoUpdate = false; });
  }
}

export class Battlefield {
  constructor(map, resources) {
    this.root = new THREE.Group();
    this.root.name = `battlefield-${map.id}`;
    this.resources = resources;
    this.map = map;
    this.colliders = [];
    const batch = new StaticBatch(resources, this.root);
    const material = (...args) => resources.material(...args);
    const concrete = material("concrete", "#8b8d87", .94, 0, "concrete");
    const dark = material("structure", "#353c40", .84, .2);
    const steel = material("steel", "#606f72", .54, .65, "metal");
    const yellow = material("safety", "#bba251", .83);
    const glass = material("windows", "#243f4a", .23, .8);
    const width = map.grid[0].length * S;
    const depth = map.grid.length * S;
    const wild = map.theme === "wild";
    const ground = material(wild ? "ground-earth" : "ground-asphalt", wild ? "#77745b" : "#656a6a", .98, 0, wild ? "earth" : "asphalt", [48, 48]);
    batch.add("box", ground, [width / 2, -.18, depth / 2], [width + 140, .35, depth + 140]);
    this.colliders.push({ position: [width / 2, -.18, depth / 2], scale: [width + 140, .35, depth + 140] });
    const rectangles = mapRectangles(map.grid);
    for (const rect of rectangles) {
      const { x, z, width: w, depth: d, tile } = rect;
      const cx = (x + w / 2) * S, cz = (z + d / 2) * S;
      if (tile === "B") {
        const height = 6.5 + Math.floor(noise(x, z) * 4) * 2.2;
        const wall = material(`facade-${x % 3}`, ["#96958c", "#7e898b", "#a99c87"][x % 3], .94, 0, "concrete", [4, 2]);
        batch.add("box", wall, [cx, height / 2, cz], [w * S, height, d * S]);
        this.colliders.push({ position: [cx, height / 2, cz], scale: [w * S, height, d * S] });
        batch.add("box", concrete, [cx, .17, cz], [w * S + .32, .34, d * S + .32]);
        batch.add("box", dark, [cx, height, cz], [w * S + .25, .22, d * S + .25]);
        for (let floor = 2.3; floor < height - .6; floor += 2.3) {
          for (let i = 1; i < w * S; i += 2.1) for (const side of [-1, 1]) {
            batch.add("box", dark, [x * S + i, floor, cz + side * (d * S / 2 + .025)], [1.15, 1.32, .12]);
            batch.add("box", glass, [x * S + i, floor + .03, cz + side * (d * S / 2 + .1)], [.95, 1.1, .035]);
            batch.add("box", concrete, [x * S + i, floor - .68, cz + side * (d * S / 2 + .13)], [1.25, .1, .3]);
          }
          for (let i = 1; i < d * S; i += 2.1) for (const side of [-1, 1]) {
            batch.add("box", dark, [cx + side * (w * S / 2 + .025), floor, z * S + i], [.12, 1.32, 1.15]);
            batch.add("box", glass, [cx + side * (w * S / 2 + .1), floor + .03, z * S + i], [.035, 1.1, .95]);
          }
        }
        batch.add("box", steel, [cx, height + .6, cz], [2.8, 1.2, 1.6]);
        for (let i = 0; i < 6; i++) batch.add("box", dark, [cx - 1.1 + i * .43, height + .65, cz + .81], [.12, .72, .04]);
        batch.add("cylinder", steel, [x * S + .2, height / 2, z * S - .12], [.08, height, .08]);
        batch.add("box", dark, [cx, 1.25, z * S - .05], [1.3, 2.5, .15]);
        batch.add("box", yellow, [cx, 2.65, z * S - .15], [1.6, .14, .12]);
      } else if (tile === "C" || tile === "O") {
        const h = tile === "C" ? 2.15 : 3;
        const crate = material(`container-${x % 3}`, ["#52645e", "#765b45", "#50616f"][x % 3], .7, .4, "metal");
        batch.add("box", crate, [cx, h / 2, cz], [w * S, h, d * S]);
        this.colliders.push({ position: [cx, h / 2, cz], scale: [w * S, h, d * S] });
        for (const side of [-1, 1]) {
          batch.add("box", steel, [cx, h - .1, cz + side * (d * S / 2 + .025)], [w * S, .13, .08]);
          for (let i = .2; i < w * S; i += .32) batch.add("box", steel, [x * S + i, h / 2, cz + side * (d * S / 2 + .025)], [.045, h - .35, .06]);
        }
        for (const side of [-1, 1]) batch.add("box", yellow, [cx + side * (w * S / 2 - .12), 1.2, cz + d * S / 2 + .07], [.1, 1.1, .025]);
      } else if (tile === "R") {
        const rock = material("limestone", "#878b7d", .99, 0, "concrete");
        // A filled core prevents holes in cover; irregular boulders break its silhouette.
        batch.add("box", rock, [cx, 1.05, cz], [w * S, 2.1, d * S]);
        this.colliders.push({ position: [cx, 1.05, cz], scale: [w * S, 2.1, d * S] });
        for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) {
          batch.add("rock", rock, [(x + dx + .5) * S, 1.3, (z + dz + .5) * S], [1.6, 1.7 + noise(dx, dz), 1.6], [noise(dx, dz), noise(x + dx, z + dz) * 6, .2]);
        }
      } else if (tile === "T") {
        const bark = material("bark", "#5d5546", .98, 0, "earth");
        const leaves = material("needles", "#263e2e", .99, 0, "earth");
        batch.add("box", bark, [cx, .8, cz], [S, 1.6, S]);
        this.colliders.push({ position: [cx, 2, cz], scale: [S, 4, S] });
        batch.add("cylinder", bark, [cx, 3, cz], [.3, 6, .3]);
        for (let level = 0; level < 5; level++) for (let branch = 0; branch < 6; branch++) {
          const angle = branch * Math.PI / 3 + level * .6;
          const radius = (1 - level / 6) * 1.3;
          batch.add("foliage", leaves, [cx + Math.cos(angle) * radius * .5, 2.7 + level * .8, cz + Math.sin(angle) * radius * .5], [radius * .7, 1.6, radius * .7], [.15, -angle, -.15]);
        }
      } else {
        const h = wild ? 3.5 : 3;
        batch.add("box", wild ? material("boundary-rock", "#666f62", .98, 0, "concrete") : concrete, [cx, h / 2, cz], [w * S, h, d * S]);
        this.colliders.push({ position: [cx, h / 2, cz], scale: [w * S, h, d * S] });
        if (!wild) batch.add("box", dark, [cx, h, cz], [w * S + .1, .16, d * S + .1]);
      }
    }
    if (!wild) {
      // Paint, drainage and lamps remain inside already walkable street cells.
      for (let z = 1; z < map.grid.length - 1; z++) for (let x = 1; x < map.grid[z].length - 1; x++) {
        if (map.grid[z][x] !== ".") continue;
        if ((x === 12 || x === 24) && z % 2 === 0) batch.add("box", yellow, [(x + .5) * S, .012, (z + .5) * S], [.1, .02, 1.1]);
        if (z % 8 === 1 && x % 10 === 1) {
          batch.add("cylinder", steel, [(x + .1) * S, 2.7, (z + .1) * S], [.055, 5.4, .055]);
          batch.add("box", dark, [(x + .1) * S + .45, 5.4, (z + .1) * S], [1.1, .1, .23]);
        }
        if (x % 7 === 0 && z % 6 === 0) batch.add("box", dark, [(x + .5) * S, .018, (z + .5) * S], [.5, .025, .8]);
      }
      // A distant skyline and dock cranes are actual geometry, visible with camera parallax.
      for (let i = 0; i < 22; i++) {
        const h = 9 + noise(i, 8) * 30;
        batch.add("box", material("skyline", "#667779", .95), [-25 + i * 7, h / 2, -22 - noise(i) * 18], [4 + noise(i) * 4, h, 5]);
      }
      for (const x of [12, 72]) {
        batch.add("box", yellow, [x, 11, -10], [.7, 22, .7]);
        batch.add("box", yellow, [x + 5, 22, -10], [16, .5, .5]);
        batch.add("cylinder", dark, [x + 10, 17, -10], [.025, 10, .025]);
      }
    } else {
      const mountain = material("mountains", "#5a685b", 1);
      for (let i = 0; i < 24; i++) {
        const angle = i / 24 * Math.PI * 2;
        batch.add("rock", mountain, [width / 2 + Math.cos(angle) * 110, 8, depth / 2 + Math.sin(angle) * 95], [20 + noise(i) * 16, 22 + noise(i, 2) * 27, 22], [0, i, 0]);
      }
      const grass = material("grass", "#5c6546", 1);
      for (let i = 0; i < 450; i++) {
        const x = 1 + noise(i, 1) * (map.grid[0].length - 2), z = 1 + noise(i, 2) * (map.grid.length - 2);
        if (map.grid[Math.floor(z)][Math.floor(x)] !== ".") continue;
        batch.add("rock", grass, [x * S, .09, z * S], [.15, .2, .2], [0, i, 0]);
      }
    }
    batch.finish();
    const parts = this.colliders.map(({ position, scale }) => {
      const part = new THREE.BoxGeometry(...scale);
      part.translate(...position);
      return part;
    });
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    geometry.boundsTree = new MeshBVH(geometry);
    this.collider = new THREE.Mesh(geometry, dark);
    this.collider.raycast = acceleratedRaycast;
    this.collider.updateMatrixWorld();
  }

  dispose() {
    this.root.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
    this.root.clear();
    this.collider.geometry.boundsTree = null;
    this.collider.geometry.dispose();
  }
}
