import * as THREE from "three";
import { WORLD_SCALE as S, noise } from "./resources.js";
import { clearBuildingCells } from "../../ws-server/src/bio-mode.js";

export class HelicopterModel {
  constructor(resources) {
    this.root = new THREE.Group();
    this.type = "helicopter";
    const armor = resources.material("heli-armor", "#455750", .64, .5, "metal");
    const dark = resources.material("heli-dark", "#20282a", .64, .45);
    const glass = resources.material("heli-glass", "#2f5963", .15, .85);
    const mesh = (kind, material, position, scale, rotation) => resources.mesh(this.root, kind, material, position, scale, rotation);
    mesh("sphere", armor, [0, 1.25, 0], [.85, .8, 1.7]);
    mesh("sphere", glass, [0, 1.42, -1.1], [.73, .58, .75]);
    mesh("box", dark, [0, 1.35, -1.75], [.07, 1, .07], [.35, 0, 0]);
    mesh("box", armor, [0, 1.12, .2], [1.7, .1, 2.5]);
    mesh("cylinder", armor, [0, 1.4, 3.1], [.23, 4.5, .23], [Math.PI / 2, 0, 0]);
    mesh("box", armor, [0, 2, 4.5], [.12, 1.8, .8], [.3, 0, 0]);
    mesh("box", armor, [0, 1.6, 3.7], [2.4, .08, .6]);
    mesh("box", dark, [0, 2.02, .3], [.65, .45, 1.7]);
    mesh("cylinder", dark, [0, 2.6, 0], [.065, .8, .065]);
    for (const side of [-1, 1]) {
      mesh("cylinder", dark, [side * .75, .25, .1], [.055, 3.6, .055], [Math.PI / 2, 0, 0]);
      mesh("cylinder", dark, [side * .65, .55, -.65], [.045, .9, .045], [0, 0, side * .35]);
      mesh("cylinder", dark, [side * .65, .55, .8], [.045, .9, .045], [0, 0, side * .35]);
      mesh("box", armor, [side * 1.2, 1, .2], [1.1, .12, .8]);
      mesh("cylinder", dark, [side * 1.45, .95, -.2], [.22, .85, .22], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 4; i++) mesh("cylinder", armor, [side * 1.45 + Math.cos(i * 1.57) * .11, .95 + Math.sin(i * 1.57) * .11, -.65], [.045, .1, .045], [Math.PI / 2, 0, 0]);
    }
    this.rotor = new THREE.Group(); this.rotor.position.y = 2.95; this.root.add(this.rotor);
    for (let i = 0; i < 4; i++) resources.mesh(this.rotor, "box", dark, [Math.cos(i * Math.PI / 2) * 2, 0, Math.sin(i * Math.PI / 2) * 2], [4.1, .035, .18], [0, -i * Math.PI / 2, 0]);
    this.tailRotor = new THREE.Group(); this.tailRotor.position.set(.25, 2.2, 4.6); this.root.add(this.tailRotor);
    for (let i = 0; i < 2; i++) resources.mesh(this.tailRotor, "box", dark, [0, 0, 0], [.04, 1.4, .12], [i * Math.PI / 2, 0, 0]);
  }
  update(vehicle, dt) {
    this.root.position.set(vehicle.x * S, (vehicle.z || 0) * S, vehicle.y * S);
    this.root.rotation.set((vehicle.z > .1 ? vehicle.speed : 0) * .025, -vehicle.angle - Math.PI / 2, 0, "YXZ");
    this.rotor.rotation.y += dt * (vehicle.driverId ? 35 : 1);
    this.tailRotor.rotation.x += dt * (vehicle.driverId ? 50 : 1);
  }
}

class TitanModel {
  constructor(resources, monster) {
    this.root = new THREE.Group();
    const skin = resources.material("titan-skin", "#465744", .65, .12, "scales", [3, 3]);
    const belly = resources.material("titan-belly", "#6d7560", .87, .05, "scales");
    const horn = resources.material("titan-horn", "#4a5146", .55, .3);
    const toxin = resources.material("toxin", "#89d75a", .38, .25);
    toxin.emissive.set("#6fcf37"); toxin.emissiveIntensity = 1.8;
    const teeth = resources.material("titan-teeth", "#bbb99e", .74);
    const mesh = (kind, mat, pos, scale, rot) => resources.mesh(this.root, kind, mat, pos, scale, rot);
    mesh("sphere", skin, [0, 6.1, .2], [2.3, 3.8, 1.7]);
    mesh("sphere", belly, [0, 5.8, -1.25], [1.65, 3.05, .55]);
    mesh("sphere", skin, [0, 9.2, -.4], [1.4, 2, 1.2]);
    mesh("sphere", skin, [0, 10.6, -1.15], [1.55, 1.35, 1.8]);
    mesh("sphere", skin, [0, 10.35, -2.35], [1.2, .65, 1.25]);
    mesh("sphere", belly, [0, 9.7, -2.2], [1, .4, 1.2]);
    for (const side of [-1, 1]) {
      mesh("sphere", toxin, [side * 1.27, 10.9, -2.15], [.18, .12, .25]);
      for (let i = 0; i < 6; i++) mesh("cone", teeth, [side * .85, 9.9, -1.5 - i * .3], [.1, .34, .1], [Math.PI, 0, 0]);
      mesh("sphere", skin, [side * 2.2, 7.3, -.15], [.75, 1.8, .8], [-.3, 0, side * -.15]);
      mesh("sphere", skin, [side * 2.4, 5.85, -1], [.55, 1.2, .55], [-.65, 0, 0]);
      for (let i = 0; i < 3; i++) mesh("cone", teeth, [side * 2.4 - .25 + i * .25, 5, -1.8], [.09, .8, .09], [-1, 0, 0]);
    }
    this.legs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * 1.2, 3.8, .1); this.root.add(leg);
      resources.mesh(leg, "sphere", skin, [0, -1.3, 0], [1, 2.4, 1]);
      resources.mesh(leg, "sphere", skin, [0, -3.2, -.55], [1, .65, 1.65]);
      for (let i = 0; i < 3; i++) resources.mesh(leg, "cone", teeth, [-.5 + i * .5, -3.45, -1.8], [.16, .8, .16], [-Math.PI / 2, 0, 0]);
      this.legs.push(leg);
    }
    this.tail = new THREE.Group(); this.tail.position.set(0, 3.9, 1.2); this.root.add(this.tail);
    for (let i = 0; i < 8; i++) resources.mesh(this.tail, "sphere", skin, [0, -i * .25, i * .95], [1.1 - i * .115, 1.05 - i * .11, .95]);
    for (let i = 0; i < 10; i++) {
      const y = 3.2 + i * .8;
      mesh("cone", i % 2 ? toxin : horn, [0, y, 1.2 + Math.sin(i / 10 * Math.PI) * .8], [.45 + Math.sin(i / 10 * Math.PI) * .4, 1.9, .3], [.65, 0, 0]);
    }
    this.bar = new THREE.Group(); this.bar.position.set(0, 13.5, 0); this.root.add(this.bar);
    resources.mesh(this.bar, "box", resources.material("hp-back", "#172324"), [0, 0, 0], [3, .18, .05]);
    this.health = resources.mesh(this.bar, "box", toxin, [0, 0, -.04], [3, .14, .04]);
    this.source = monster.source;
  }
  update(monster, camera) {
    const emerging = Math.min(1, monster.emerged / 3.5);
    this.root.visible = monster.active;
    this.root.position.set(monster.x * S, monster.alive ? -12 * (1 - emerging) : -.7, monster.y * S);
    this.root.rotation.set(monster.alive ? 0 : Math.min(1.3, .3 + (monster.emerged || 0) * .1), -monster.angle - Math.PI / 2, 0);
    const phase = monster.phase || 0;
    this.legs.forEach((leg, i) => { leg.rotation.x = monster.alive ? Math.sin(phase + i * Math.PI) * .18 : 0; });
    this.tail.rotation.y = Math.sin(phase * .6) * .18;
    this.health.scale.x = 3 * Math.max(0, monster.health / monster.maxHealth);
    this.bar.lookAt(camera.position);
  }
}

export class BioScene {
  constructor(scene, resources) {
    this.scene = scene; this.resources = resources;
    this.models = new Map();
    this.portals = new Map();
    this.root = new THREE.Group(); scene.add(this.root);
    this.rift = resources.material("rift", "#5eb2b0", .4, .2);
    this.rift.emissive.set("#37a9aa"); this.rift.emissiveIntensity = 2;
  }
  update(state, camera, time) {
    const active = new Set();
    for (const monster of state?.monsters || []) {
      active.add(monster.id);
      let model = this.models.get(monster.id);
      if (!model) { model = new TitanModel(this.resources, monster); this.models.set(monster.id, model); }
      model.update(monster, camera);
      let portal = this.portals.get(monster.id);
      if (!portal) {
        portal = new THREE.Group();
        this.resources.mesh(portal, "torus", this.rift, [0, 0, 0], [4, 5.5, 4]);
        this.resources.mesh(portal, "torus", this.rift, [0, 0, 0], [4.4, 5.9, 4.4]);
        this.portals.set(monster.id, portal); this.root.add(portal);
      }
      portal.visible = monster.active && monster.emerged < 6;
      portal.position.set(monster.x * S, monster.source === "portal" ? 5.5 : .15, monster.y * S);
      portal.rotation.set(monster.source === "portal" ? 0 : -Math.PI / 2, 0, time * .25);
      const sourceMaterial = monster.source === "sea" ? this.resources.material("sea-rift", "#75c8d1", .2, .65) : monster.source === "ground" ? this.resources.material("earth-rift", "#ab925b", .8) : this.rift;
      portal.children.forEach(child => { child.material = sourceMaterial; });
    }
    for (const [id] of this.models) if (!active.has(id)) { this.models.delete(id); this.portals.get(id)?.removeFromParent(); this.portals.delete(id); }
    this.root.visible = Boolean(state);
  }
  dispose() { this.models.clear(); this.portals.clear(); this.root.removeFromParent(); }
}

export function damagedMap(map, state) {
  if (!state?.destroyed?.length) return map;
  const copy = { ...map, grid: [...map.grid], rubble: [] };
  for (const building of state.buildings) {
    if (!state.destroyed.includes(building.id)) continue;
    clearBuildingCells(copy, building);
    for (let i = 0; i < 14; i++) copy.rubble.push({ x: building.x + noise(i, building.x) * building.width, y: building.y + noise(i, building.y + 7) * building.depth, size: .3 + noise(i, 4) * .5 });
  }
  return copy;
}
