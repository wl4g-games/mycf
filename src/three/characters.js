import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { createWeapon, getActorRenderProfile } from "./models.js";
import { WORLD_SCALE as S } from "./resources.js";

export class CharacterLibrary {
  constructor() {
    this.asset = null;
    this.disposed = false;
    this.materials = new Map();
    this.ready = new GLTFLoader().loadAsync(new URL("../../assets/models/soldier.glb", import.meta.url).href).then(asset => {
      if (!asset.scene.getObjectByProperty("isSkinnedMesh", true)) throw new Error("The character asset has no skinned mesh.");
      this.asset = asset;
      if (this.disposed) { this.disposeAsset(); return; }
      const bounds = new THREE.Box3().setFromObject(asset.scene);
      this.scale = 1.98 / bounds.getSize(new THREE.Vector3()).y;
      this.feet = bounds.min.y;
    }).catch(error => { this.error = error; });
  }
  get loaded() { return Boolean(this.asset) && !this.disposed; }
  material(source, team) {
    const key = `${source.uuid}:${team}`;
    if (!this.materials.has(key)) {
      const material = source.clone();
      material.roughness = Math.max(.55, source.roughness || .7);
      material.metalness = Math.min(.35, source.metalness || 0);
      material.color.multiply(new THREE.Color(team === "seal" ? "#bfd0d1" : "#dbc5aa"));
      for (const value of Object.values(material)) if (value?.isTexture) value.anisotropy = 4;
      this.materials.set(key, material);
    }
    return this.materials.get(key);
  }
  create(resources, actor) { return new AnimatedSoldier(this, resources, actor); }
  disposeAsset() {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    this.asset?.scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    for (const material of [...materials, ...this.materials.values()]) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
    for (const geometry of geometries) geometry.dispose();
    this.materials.clear(); this.asset = null;
  }
  dispose() { this.disposed = true; this.disposeAsset(); }
}

class AnimatedSoldier {
  constructor(library, resources, actor) {
    this.root = new THREE.Group();
    this.skinned = true;
    this.characterId = actor.characterId;
    this.team = actor.team;
    this.resources = resources;
    this.skin = clone(library.asset.scene);
    this.skin.scale.multiplyScalar(library.scale);
    this.skin.position.y = -library.feet * library.scale;
    this.skin.rotation.y = 0;
    this.root.scale.setScalar(getActorRenderProfile(actor.characterId).scale);
    this.root.add(this.skin);
    this.skin.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = object.receiveShadow = true;
      object.frustumCulled = false;
      object.material = library.material(object.material, actor.team);
    });
    this.mixer = new THREE.AnimationMixer(this.skin);
    const lowerBody = clip => new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.filter(track => !/Arm|Hand|Shoulder/.test(track.name)));
    this.actions = Object.fromEntries(library.asset.animations.filter(clip => clip.name !== "TPose").map(clip => [clip.name, this.mixer.clipAction(lowerBody(clip))]));
    const idle = library.asset.animations.find(clip => clip.name === "Idle");
    if (idle) this.mixer.clipAction(new THREE.AnimationClip("UpperBodyIdle", idle.duration, idle.tracks.filter(track => /Arm|Hand|Shoulder/.test(track.name)))).play();
    for (const action of Object.values(this.actions)) action.play();
    this.time = Math.random() * 5;
    this.mixer.setTime(this.time);
    this.hand = this.skin.getObjectByName("mixamorigRightHand") || this.skin.getObjectByName("mixamorig:RightHand");
    this.handPosition = new THREE.Vector3();
    this.weaponId = null;
    this.setWeapon(actor.weaponId);
  }
  setWeapon(id) {
    if (id === this.weaponId) return;
    if (this.weapon) this.root.remove(this.weapon.root);
    this.weapon = createWeapon(this.resources, id);
    // Rigid weapon parts render through the shared instance batches, not per soldier.
    this.weapon.root.traverse(object => { if (object.isMesh) object.layers.set(2); });
    this.root.add(this.weapon.root);
    this.weaponId = id;
  }
  update(actor, motion = {}, dt = 0) {
    this.setWeapon(actor.weaponId);
    this.time += dt;
    const activity = motion.activity || 0;
    const moving = Math.min(1, activity * 2);
    const running = Math.max(0, Math.min(1, (activity - .35) / .5)) * moving;
    this.actions.Idle?.setEffectiveWeight(1 - moving);
    this.actions.Walk?.setEffectiveWeight(moving - running);
    this.actions.Run?.setEffectiveWeight(running);
    this.mixer.timeScale = .85 + activity * .4;
    this.mixer.update(dt);
    this.root.position.set(actor.x * S, (actor.z || 0) * S, actor.y * S);
    this.root.rotation.y = -actor.angle - Math.PI / 2;
    this.root.updateMatrixWorld(true);
    if (this.hand) {
      this.hand.getWorldPosition(this.handPosition);
      this.root.worldToLocal(this.handPosition);
      this.weapon.root.position.copy(this.handPosition).add(new THREE.Vector3(0, .1, .17));
    } else this.weapon.root.position.set(.18, 1.2, -.25);
    this.weapon.root.rotation.x = -(actor.pitch || 0);
  }
  dispose() {
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.skin);
    this.skin.traverse(object => { if (object.isSkinnedMesh) object.skeleton.dispose(); });
    this.root.removeFromParent();
  }
}
