import * as THREE from "three";
import { createWeapon } from "./models.js";

export class FirstPersonWeapon {
  constructor(resources) {
    this.resources = resources;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xe1eef3, 0x625b4b, 2.4));
    const light = new THREE.DirectionalLight(0xffe6c5, 3.2);
    light.position.set(-2, 5, 1);
    this.scene.add(light);
    this.camera = new THREE.PerspectiveCamera(58, 1, .01, 10);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.kick = this.swing = this.flashTime = this.time = 0;
    this.muzzleLight = new THREE.PointLight(0xffb75b, 0, 3, 2);
    this.root.add(this.muzzleLight);
    this.flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffd99a, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending });
    this.flash = new THREE.Mesh(resources.geometry("sphere"), this.flashMaterial);
    this.flash.scale.set(.055, .055, .16);
    this.root.add(this.flash);
  }
  setWeapon(id) {
    if (id === this.weaponId) return;
    if (this.model) this.root.remove(this.model.root);
    if (this.second) this.root.remove(this.second.root);
    this.model = createWeapon(this.resources, id);
    const gloves = this.resources.material("gloves", "#282e2b", .95);
    const sleeve = this.resources.material("sleeves", "#4e5e58", .99, 0, "earth");
    for (const [x, y, z] of [[.01, -.16, -.16], [-.035, -.05, -.59]]) {
      this.resources.mesh(this.model.root, "sphere", gloves, [x, y, z], [.06, .065, .09]);
      this.resources.mesh(this.model.root, "cylinder", sleeve, [x + .045, y - .1, z + .12], [.06, .27, .06], [-.8, 0, -.25]);
    }
    this.root.add(this.model.root);
    this.second = null;
    if (id === "dualPistols" || id === "dualBlades") {
      this.second = createWeapon(this.resources, id === "dualPistols" ? "whitePistol" : "swiss");
      this.second.root.position.x = -.52;
      this.second.root.rotation.y = -.08;
      this.root.add(this.second.root);
    }
    this.weaponId = id;
    this.kick = this.swing = this.flashTime = 0;
  }
  triggerShot(event) {
    this.setWeapon(event.weaponId);
    if (this.model.melee || this.model.bow) this.swing = 1;
    else { this.kick = 1; this.flashTime = .055; }
  }
  update(game, motion, dt, aspect) {
    this.setWeapon(game.player.weaponId);
    this.time += dt;
    this.kick *= Math.exp(-dt * 19);
    this.swing = Math.max(0, this.swing - dt * 3.2);
    this.flashTime = Math.max(0, this.flashTime - dt);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const activity = motion?.activity || 0, phase = motion?.phase || 0;
    const swing = Math.sin(this.swing * Math.PI);
    this.root.position.set(.23 + Math.cos(phase * .5) * activity * .012 - (this.model.melee ? swing * .24 : 0), -.24 - Math.abs(Math.sin(phase)) * activity * .012 + Math.sin(this.time * 1.5) * .002, -.33 + this.kick * .075);
    this.root.rotation.set(this.kick * .06 + (this.model.melee ? swing * 1.1 : 0), .035 - (this.model.melee ? swing * .9 : 0), this.kick * -.025);
    if (aspect < .9) { this.root.scale.setScalar(.78); this.root.position.x = .12; }
    else this.root.scale.setScalar(1);
    this.flash.position.copy(this.model.muzzle.position);
    this.muzzleLight.position.copy(this.model.muzzle.position);
    this.flash.visible = this.flashTime > 0;
    this.muzzleLight.intensity = this.flashTime > 0 ? 2.5 : 0;
    this.scene.visible = game.player.alive && !game.player.scoped && !game.currentVehicle;
  }
  dispose() { this.flashMaterial.dispose(); this.scene.clear(); }
}
