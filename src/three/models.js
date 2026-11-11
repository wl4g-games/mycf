import * as THREE from "three";
import { CHARACTER_PROFILES, DEFAULT_CHARACTER_ID, resolveCharacterId } from "../config.js";
import { WORLD_SCALE as S } from "./resources.js";

export function getActorRenderProfile(id) {
  return CHARACTER_PROFILES[resolveCharacterId(id)] || CHARACTER_PROFILES[DEFAULT_CHARACTER_ID];
}

export function createWeapon(resources, weaponId = "ak47") {
  const root = new THREE.Group();
  root.name = `weapon-${weaponId}`;
  const metal = resources.material("gunmetal", "#353d42", .4, .85);
  const polymer = resources.material("polymer", "#24292b", .83, .12);
  const steel = resources.material("weapon-steel", "#a3aaa7", .3, .9);
  const wood = resources.material("walnut", "#60432e", .7, .08, "earth");
  const grip = resources.material("weapon-grip", "#484b40", .95);
  const optic = resources.material("optic", "#193e39", .13, .85);
  const mesh = (kind, mat, pos, scale, rot) => resources.mesh(root, kind, mat, pos, scale, rot);
  const melee = ["swiss", "axe", "dualBlades"].includes(weaponId);
  const bow = weaponId === "powerBow";
  const pistol = ["whitePistol", "baike", "desertEagle", "dualPistols"].includes(weaponId);
  const sniper = weaponId === "barrett";
  const barrelEnd = sniper ? -1.13 : pistol ? -.43 : -.88;
  if (bow) {
    mesh("box", polymer, [0, 0, 0], [.065, .28, .065]);
    for (const side of [-1, 1]) {
      mesh("box", metal, [0, side * .3, -.06], [.045, .4, .045], [side * -.4, 0, 0]);
      mesh("cylinder", polymer, [0, side * .49, -.15], [.08, .035, .08], [0, 0, Math.PI / 2]);
      mesh("cylinder", steel, [0, side * .25, .025], [.004, .5, .004], [side * -.3, 0, 0]);
    }
    mesh("cylinder", wood, [0, 0, -.25], [.008, .8, .008], [Math.PI / 2, 0, 0]);
    mesh("cone", steel, [0, 0, -.68], [.025, .08, .025], [-Math.PI / 2, 0, 0]);
  } else if (melee) {
    mesh("box", grip, [0, -.04, .05], [.055, .19, .065]);
    mesh("box", steel, [0, .18, .05], [.055, .3, .012], [0, 0, -.1]);
    mesh("box", metal, [0, .065, .05], [.13, .025, .065]);
    if (weaponId === "axe") {
      mesh("cylinder", wood, [0, -.07, 0], [.025, .65, .025]);
      mesh("box", steel, [-.08, .27, 0], [.25, .18, .045], [0, 0, -.25]);
    }
  } else {
    const furniture = weaponId === "ak47" ? wood : polymer;
    mesh("box", metal, [0, 0, -.3], [pistol ? .07 : .095, .105, pistol ? .28 : .36]);
    mesh("box", pistol && weaponId !== "baike" ? steel : metal, [0, .06, pistol ? -.3 : -.35], [pistol ? .075 : .1, .05, pistol ? .29 : .4]);
    mesh("box", furniture, [0, -.1, -.17], [.065, .2, .085], [-.22, 0, 0]);
    if (!pistol) {
      mesh("box", furniture, [0, -.025, .03], [.085, .14, .3]);
      mesh("box", polymer, [0, -.02, .19], [.1, .2, .045]);
      mesh("box", furniture, [0, -.015, -.58], [.09, .11, .22]);
      mesh("box", metal, [0, -.15, -.35], [.055, sniper ? .13 : .25, .11], [-.12, 0, 0]);
      mesh("cylinder", metal, [0, .015, (barrelEnd - .64) / 2], [.018, -barrelEnd - .64, .018], [Math.PI / 2, 0, 0]);
      mesh("cylinder", steel, [0, .015, barrelEnd + .04], [.028, .09, .028], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 9; i++) mesh("box", polymer, [0, .073, -.2 - i * .048], [.105, .018, .018]);
      if (sniper || weaponId === "policeMG") {
        mesh("box", metal, [0, .14, -.29], [.055, .1, .16]);
        mesh("cylinder", polymer, [0, .21, -.34], [.052, .32, .052], [Math.PI / 2, 0, 0]);
        mesh("cylinder", optic, [0, .21, -.505], [.045, .012, .045], [Math.PI / 2, 0, 0]);
      } else {
        mesh("box", metal, [0, .11, -.29], [.06, .035, .035]);
        mesh("box", metal, [0, .1, -.72], [.025, .12, .025]);
      }
    } else {
      mesh("box", metal, [0, -.055, -.29], [.025, .075, .08]);
      mesh("box", steel, [0, .1, -.4], [.015, .018, .018]);
    }
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, .015, barrelEnd - .05);
  root.add(muzzle);
  return { root, muzzle, melee, bow, pistol };
}

function limb(resources, parent, material, origin, length, radius) {
  const joint = new THREE.Group();
  joint.position.set(...origin);
  parent.add(joint);
  resources.mesh(joint, "cylinder", material, [0, -length / 2, 0], [radius, length, radius]);
  resources.mesh(joint, "sphere", material, [0, -length, 0], [radius * 1.04, radius * 1.04, radius * 1.04]);
  return joint;
}

export class SoldierModel {
  constructor(resources, actor) {
    this.root = new THREE.Group();
    this.characterId = actor.characterId;
    this.team = actor.team;
    this.resources = resources;
    const profile = getActorRenderProfile(actor.characterId);
    const uniform = resources.material(`uniform-${actor.team}`, actor.team === "seal" ? "#475d60" : "#72634f", .97, 0, "earth");
    const armor = resources.material(`armor-${actor.team}`, actor.team === "seal" ? "#2c393c" : "#454339", .86, .13);
    const boot = resources.material("boots", "#222626", .91);
    const skin = resources.material(`skin-${profile.skinTone}`, profile.skinTone, .85);
    const visor = resources.material("visor", "#222e32", .22, .7);
    const marker = resources.material(`team-${actor.team}`, actor.team === "seal" ? "#739fa7" : "#ac785d", .7);
    const mesh = (kind, mat, pos, scale, rot) => resources.mesh(this.root, kind, mat, pos, scale, rot);
    // Human proportions: head is one eighth of total height, with articulated limbs.
    mesh("sphere", uniform, [0, 1.18, 0], [.255 * profile.shoulderScale, .35, .145]);
    mesh("box", armor, [0, 1.32, -.11], [.4, .43, .12]);
    mesh("box", armor, [0, 1.32, .15], [.32, .42, .13]);
    for (let i = 0; i < 3; i++) mesh("box", uniform, [-.13 + i * .13, 1.17, -.205], [.1, .15, .055]);
    mesh("cylinder", skin, [0, 1.64, 0], [.065, .15, .065]);
    mesh("sphere", skin, [0, 1.8, -.015], [.115, .155, .12]);
    mesh("sphere", armor, [0, 1.9, 0], [.137, .115, .14]);
    mesh("box", visor, [0, 1.81, -.116], [.2, .062, .04]);
    mesh("box", armor, [0, 1.7, -.105], [.15, .075, .035]);
    mesh("box", armor, [0, 1.91, -.04], [.06, .055, .21]);
    mesh("box", marker, [.26, 1.45, 0], [.025, .09, .12]);
    mesh("box", marker, [-.26, 1.45, 0], [.025, .09, .12]);
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = limb(resources, this.root, uniform, [side * .13, 1.02, 0], .43, .095);
      const knee = limb(resources, hip, uniform, [0, -.43, 0], .41, .075);
      resources.mesh(knee, "box", armor, [0, -.03, -.07], [.13, .16, .075]);
      resources.mesh(knee, "box", boot, [0, -.38, -.055], [.15, .16, .29]);
      this.legs.push({ hip, knee });
    }
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulder = limb(resources, this.root, uniform, [side * .27, 1.53, 0], .3, .073);
      shoulder.rotation.x = .6;
      shoulder.rotation.z = -side * .28;
      const elbow = limb(resources, shoulder, uniform, [0, -.3, 0], .29, .06);
      elbow.rotation.x = .8;
      resources.mesh(elbow, "sphere", boot, [0, -.29, 0], [.065, .075, .065]);
      this.arms.push(shoulder);
    }
    this.weaponPivot = new THREE.Group();
    this.weaponPivot.position.set(.16, 1.32, -.37);
    this.root.add(this.weaponPivot);
    this.setWeapon(actor.weaponId);
    this.root.scale.setScalar(profile.scale);
  }
  setWeapon(id) {
    if (id === this.weaponId) return;
    this.weaponPivot.clear();
    this.weapon = createWeapon(this.resources, id);
    this.weaponPivot.add(this.weapon.root);
    this.weaponId = id;
  }
  update(actor, motion) {
    this.setWeapon(actor.weaponId);
    this.root.position.set(actor.x * S, Math.abs(Math.sin(motion?.phase || 0)) * (motion?.activity || 0) * .035, actor.y * S);
    this.root.rotation.y = -actor.angle - Math.PI / 2;
    this.weaponPivot.rotation.x = -(actor.pitch || 0);
    this.legs.forEach(({ hip, knee }, i) => {
      const stride = Math.sin((motion?.phase || 0) + i * Math.PI) * (motion?.activity || 0);
      hip.rotation.x = stride * .65;
      knee.rotation.x = Math.max(0, -stride) * .9;
    });
  }
}

export class VehicleModel {
  constructor(resources, type) {
    this.root = new THREE.Group();
    this.type = type;
    const armor = resources.material("vehicle-armor", "#525f4f", .72, .45, "metal");
    const dark = resources.material("vehicle-dark", "#262d2d", .82, .3);
    const rubber = resources.material("rubber", "#202321", .99);
    const glass = resources.material("vehicle-glass", "#20373c", .15, .8);
    const steel = resources.material("vehicle-hubs", "#6c7168", .47, .7);
    const mesh = (kind, mat, pos, scale, rot) => resources.mesh(this.root, kind, mat, pos, scale, rot);
    const car = type === "armoredCar";
    mesh("box", armor, [0, car ? .65 : .58, 0], [car ? 1.5 : 1.95, .65, car ? 2.45 : 2.8]);
    mesh("box", armor, [0, .95, -.78], [1.5, .3, .8], [-.22, 0, 0]);
    this.wheels = [];
    if (car) {
      mesh("box", armor, [0, 1.15, .25], [1.3, .75, 1.4]);
      mesh("box", glass, [0, 1.35, -.48], [1.1, .3, .035], [-.2, 0, 0]);
      for (const side of [-1, 1]) mesh("box", glass, [side * .66, 1.35, .12], [.025, .3, .65]);
    }
    for (const side of [-1, 1]) {
      if (!car) mesh("box", rubber, [side * 1, .34, 0], [.44, .57, 3.1]);
      for (let i = 0; i < (car ? 2 : 6); i++) {
        const z = car ? -.8 + i * 1.65 : -1.22 + i * .48;
        const wheel = mesh("cylinder", car ? rubber : dark, [side * (car ? .8 : 1.03), .34, z], [car ? .4 : .24, car ? .23 : .46, car ? .4 : .24], [0, 0, Math.PI / 2]);
        this.wheels.push(wheel);
        mesh("cylinder", steel, [side * (car ? .93 : 1.27), .34, z], [.14, .025, .14], [0, 0, Math.PI / 2]);
      }
      mesh("box", steel, [side * .55, .72, -1.26], [.18, .12, .04]);
      mesh("box", dark, [side * .82, .96, .1], [.18, .14, 2.3]);
    }
    this.turret = new THREE.Group();
    this.turret.position.y = car ? 1.64 : 1.02;
    this.root.add(this.turret);
    resources.mesh(this.turret, "box", armor, [0, .14, 0], [car ? .65 : 1.12, .4, car ? .6 : 1.3]);
    resources.mesh(this.turret, "cylinder", dark, [0, .16, car ? -.65 : -1.4], [car ? .035 : .085, car ? 1.15 : 2.1, car ? .035 : .085], [Math.PI / 2, 0, 0]);
    resources.mesh(this.turret, "cylinder", armor, [0, .38, .2], [.24, .06, .24]);
    resources.mesh(this.turret, "cylinder", dark, [.36, .9, .4], [.012, 1.5, .012], [0, 0, .08]);
  }
  update(vehicle, dt) {
    this.root.position.set(vehicle.x * S, 0, vehicle.y * S);
    this.root.rotation.y = -vehicle.angle - Math.PI / 2;
    this.turret.rotation.y = -(vehicle.turretAngle ?? vehicle.angle) + vehicle.angle;
    for (const wheel of this.wheels) wheel.rotation.x += (vehicle.speed || 0) * dt * 4;
  }
}
