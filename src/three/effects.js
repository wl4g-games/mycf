import * as THREE from "three";
import { CombatTracerSystem } from "../combat-tracer.js";
import { WORLD_SCALE as S, worldPoint, noise } from "./resources.js";

export class BattlefieldEffects {
  constructor(scene, resources) {
    this.tracers = new CombatTracerSystem();
    this.root = new THREE.Group();
    scene.add(this.root);
    this.materials = [
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      new THREE.MeshStandardMaterial({ color: 0xb5b7ac, transparent: true, opacity: .22, depthWrite: false, roughness: 1 }),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: .65, blending: THREE.AdditiveBlending, depthWrite: false }),
    ];
    this.beams = new THREE.InstancedMesh(resources.geometry("cylinder"), this.materials[0], 96);
    this.projectiles = new THREE.InstancedMesh(resources.geometry("sphere"), this.materials[0], 128);
    this.smoke = new THREE.InstancedMesh(resources.geometry("sphere"), this.materials[1], 192);
    this.sparks = new THREE.InstancedMesh(resources.geometry("sphere"), this.materials[2], 256);
    for (const mesh of [this.beams, this.projectiles, this.smoke, this.sparks]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.root.add(mesh);
    }
    this.transform = new THREE.Object3D();
    this.color = new THREE.Color();
    this.up = new THREE.Vector3(0, 1, 0);
    this.direction = new THREE.Vector3();
    this.muzzleWorld = new THREE.Vector3();
    this.impactEvents = [];
  }
  trigger(event, playerId) {
    this.tracers.trigger(event, playerId);
    if (event.to && !["knife", "axe"].includes(event.profile)) {
      this.impactEvents.push({ point: { ...event.to }, life: .25, hit: event.hit });
      if (this.impactEvents.length > 24) this.impactEvents.shift();
    }
  }
  instance(mesh, index, position, scale, color = null) {
    this.transform.position.copy(position);
    this.transform.scale.set(...scale);
    this.transform.updateMatrix();
    mesh.setMatrixAt(index, this.transform.matrix);
    if (color) mesh.setColorAt(index, this.color.set(color));
  }
  update(game, dt, camera) {
    this.tracers.advance(dt);
    let count = 0;
    for (const trace of this.tracers.items) {
      const from = worldPoint(trace.from), to = worldPoint(trace.to);
      if (trace.actorId === game.player.id && !game.player.scoped) {
        this.muzzleWorld.set(.23, -.22, -1).applyQuaternion(camera.quaternion).add(camera.position);
        from.copy(this.muzzleWorld);
      }
      this.direction.subVectors(to, from);
      const length = this.direction.length();
      this.transform.quaternion.setFromUnitVectors(this.up, this.direction.normalize());
      this.instance(this.beams, count++, from.add(to).multiplyScalar(.5), [.009, length, .009], trace.incomingHit ? "#ff5341" : trace.profile === "bow" ? "#c9d6ac" : "#ffce7b");
    }
    this.beams.count = count;
    this.transform.quaternion.identity();
    count = 0;
    for (const projectile of (game.projectiles || []).slice(0, 128)) {
      const size = projectile.type === "rocket" ? .15 : projectile.type === "shell" ? .07 : .1;
      this.instance(this.projectiles, count++, worldPoint(projectile), [size, size, size], ["shell", "rocket"].includes(projectile.type) ? "#ffdc8e" : "#677363");
    }
    this.projectiles.count = count;
    let smokeCount = 0, sparkCount = 0;
    this.insideSmoke = false;
    for (const effect of (game.effects || []).slice(-24)) {
      const age = effect.maxLife - effect.life;
      const center = worldPoint(effect);
      if (effect.type === "smoke") {
        const radius = effect.radius * S * .55 * Math.min(1, age * 1.8);
        for (let i = 0; i < 8 && smokeCount < 192; i++) {
          const angle = i * 2.399;
          const position = center.clone().add(new THREE.Vector3(Math.cos(angle + age * .035) * radius * .6, .6 + noise(i, 3) * radius * .4, Math.sin(angle + age * .035) * radius * .6));
          const size = radius * (.5 + noise(i) * .2) * Math.min(1, effect.life);
          this.instance(this.smoke, smokeCount++, position, [size, size * .8, size]);
        }
        if (camera.position.distanceTo(center) < radius) this.insideSmoke = true;
      } else {
        for (let i = 0; i < 18 && sparkCount < 230; i++) {
          const angle = i * 2.399;
          const r = Math.min(effect.radius * S, age * 10) * noise(i, 6);
          const position = center.clone().add(new THREE.Vector3(Math.cos(angle) * r, .15 + Math.sin(age * 3) * noise(i) * 3, Math.sin(angle) * r));
          const size = Math.max(.02, .2 * effect.life / effect.maxLife);
          this.instance(this.sparks, sparkCount++, position, [size, size, size], i % 2 ? "#eebd73" : "#d7733c");
        }
      }
    }
    this.impactEvents = this.impactEvents.filter(impact => (impact.life -= dt) > 0);
    for (const impact of this.impactEvents) {
      if (sparkCount >= 256) break;
      const size = impact.life * .15;
      this.instance(this.sparks, sparkCount++, worldPoint(impact.point), [size, size, size], impact.hit ? "#d68b68" : "#ffe0a3");
    }
    this.smoke.count = smokeCount;
    this.sparks.count = sparkCount;
    for (const mesh of [this.beams, this.projectiles, this.smoke, this.sparks]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
  clear() { this.tracers.clear(); this.impactEvents.length = 0; }
  dispose() { for (const mesh of this.root.children) mesh.dispose(); for (const material of this.materials) material.dispose(); this.root.removeFromParent(); }
}
