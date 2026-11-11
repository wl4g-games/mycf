import * as THREE from "three";
import { EffectComposer, EffectPass, RenderPass, SMAAEffect, BloomEffect, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FOV, SCOPED_FOV, MAPS, clamp } from "./config.js";
import { MotionTracker } from "./render-animation.js";
import { RenderResources, WORLD_SCALE as S, EYE_HEIGHT } from "./three/resources.js";
import { Battlefield } from "./three/world.js";
import { SoldierModel, VehicleModel } from "./three/models.js";
import { FirstPersonWeapon } from "./three/viewmodel.js";
import { BattlefieldEffects } from "./three/effects.js";
import { ModelBatch } from "./three/model-batch.js";
import { drawRadar } from "./three/radar.js";

export { getActorRenderProfile } from "./three/models.js";

export function getVehicleRenderState(game) {
  const vehicles = game.vehicles || (game.tank ? [game.tank] : []);
  return { vehicles, ownVehicle: vehicles.find(vehicle => vehicle.driverId === game.player?.id) || null, driverIds: new Set(vehicles.map(vehicle => vehicle.driverId).filter(Boolean)) };
}

export function verticalFov(horizontalFov, aspect) {
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(horizontalFov / 2) / Math.max(.1, aspect)));
}

export class Renderer {
  constructor(canvas, radar) {
    this.canvas = canvas;
    this.radar = radar;
    this.resources = new RenderResources();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#9aafb3");
    this.scene.fog = new THREE.FogExp2("#9aafb3", .006);
    this.camera = new THREE.PerspectiveCamera(60, 1, .045, 400);
    this.camera.rotation.order = "YXZ";
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.toneMapping = THREE.NoToneMapping;
    this.webgl.shadowMap.enabled = true;
    this.webgl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.webgl.info.autoReset = false;
    this.refreshEnvironment();
    this.scene.add(new THREE.HemisphereLight(0xd2e3ed, 0x64634d, 2));
    this.sun = new THREE.DirectionalLight(0xffdfb1, 3.5);
    this.sun.position.set(-35, 65, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 150 });
    this.sun.shadow.bias = -.00025;
    this.sun.shadow.normalBias = .025;
    this.scene.add(this.sun, this.sun.target);
    this.composer = new EffectComposer(this.webgl, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new EffectPass(this.camera,
      new SMAAEffect(),
      new BloomEffect({ intensity: .15, luminanceThreshold: 1.4, mipmapBlur: true, resolutionScale: .5 }),
      new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
    ));
    this.viewmodel = new FirstPersonWeapon(this.resources);
    this.viewmodel.scene.environment = this.environment.texture;
    this.viewmodel.scene.environmentIntensity = .8;
    this.effects = new BattlefieldEffects(this.scene, this.resources);
    this.motionTracker = new MotionTracker();
    this.actors = new Map(); this.vehicles = new Map();
    this.modelBatch = new ModelBatch();
    this.scene.add(this.modelBatch.root);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    this.forward = new THREE.Vector3();
    this.sunOffset = new THREE.Vector3(-35, 65, 30);
    this.animationTime = this.radarClock = this.sampleTime = this.sampleFrames = 0;
    this.pixelScale = 1;
    this.lowPerformanceSamples = this.highPerformanceSamples = 0;
    this.previewMapId = "city";
    this.onResize = () => this.resize();
    this.onContextLost = event => { event.preventDefault(); this.contextLost = true; this.canvas.dispatchEvent(new CustomEvent("render-status", { detail: { state: "lost" } })); };
    this.onContextRestored = () => { this.refreshEnvironment(); this.contextLost = false; this.resize(); this.canvas.dispatchEvent(new CustomEvent("render-status", { detail: { state: "ready" } })); };
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);
    window.addEventListener("resize", this.onResize);
    this.resize();
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth || innerWidth), height = Math.max(1, this.canvas.clientHeight || innerHeight);
    this.width = width; this.height = height;
    this.webgl.setPixelRatio(Math.min(devicePixelRatio || 1, width < 900 ? 1.25 : 1.5) * this.pixelScale);
    this.webgl.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  refreshEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.webgl);
    const room = new RoomEnvironment();
    this.environment?.dispose();
    this.environment = pmrem.fromScene(room, .04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = .4;
    if (this.viewmodel) this.viewmodel.scene.environment = this.environment.texture;
    room.dispose(); pmrem.dispose();
  }

  setPreviewMap(mapId) { this.previewMapId = MAPS[mapId] ? mapId : "city"; }

  setMap(map) {
    if (this.map === map) return;
    if (this.battlefield) { this.scene.remove(this.battlefield.root); this.battlefield.dispose(); }
    this.battlefield = new Battlefield(map, this.resources);
    this.scene.add(this.battlefield.root);
    this.map = map;
    this.scene.background.set(map.theme === "wild" ? "#9ea99c" : "#9aafb3");
    this.scene.fog.color.copy(this.scene.background);
    this.effects.clear();
    this.motionTracker.clear();
    for (const model of [...this.actors.values(), ...this.vehicles.values()]) this.scene.remove(model.root);
    this.actors.clear(); this.vehicles.clear();
  }

  render(game, dt = 0, { preview = !game.started, frameTime = dt } = {}) {
    if (this.contextLost || document.hidden || !game.player || !game.map) return;
    const delta = clamp(Number(dt) || 0, 0, .05);
    this.animationTime += delta;
    this.setMap(preview ? MAPS[this.previewMapId] : game.map);
    this.webgl.info.reset();
    const { vehicles, ownVehicle, driverIds } = getVehicleRenderState(game);
    const active = new Set();
    for (const actor of game.actors) {
      if (preview || !actor.alive || actor.id === game.player.id || driverIds.has(actor.id)) continue;
      active.add(actor.id);
      let model = this.actors.get(actor.id);
      if (!model || model.characterId !== actor.characterId || model.team !== actor.team) {
        if (model) this.scene.remove(model.root);
        model = new SoldierModel(this.resources, actor); this.actors.set(actor.id, model);
      }
      model.update(actor, this.motionTracker.sample(actor.id, actor, delta));
      model.root.visible = true;
    }
    for (const [id, model] of this.actors) if (!active.has(id)) { this.scene.remove(model.root); this.actors.delete(id); }
    active.add(game.player.id);
    const motion = this.motionTracker.sample(game.player.id, game.player, delta);
    this.motionTracker.retain(active);
    const activeVehicles = new Set();
    for (const vehicle of vehicles) {
      if (preview || vehicle.health <= 0) continue;
      activeVehicles.add(vehicle.id);
      let model = this.vehicles.get(vehicle.id);
      if (!model) { model = new VehicleModel(this.resources, vehicle.type); this.vehicles.set(vehicle.id, model); }
      model.update(vehicle, delta);
      model.root.visible = vehicle !== ownVehicle;
    }
    for (const [id, model] of this.vehicles) if (!activeVehicles.has(id)) { this.scene.remove(model.root); this.vehicles.delete(id); }
    this.modelBatch.update([...this.actors.values(), ...this.vehicles.values()]);
    if (preview) {
      const orbit = this.animationTime * .035;
      this.camera.position.set(43 + Math.cos(orbit) * 32, 30, 32 + Math.sin(orbit) * 35);
      this.camera.lookAt(43, 1, 30);
      this.camera.fov = 55;
    } else {
      this.camera.position.set(game.player.x * S, ownVehicle ? 2.5 : EYE_HEIGHT, game.player.y * S);
      this.camera.rotation.set(-(game.player.pitch || 0), -game.player.angle - Math.PI / 2, 0);
      this.camera.fov = verticalFov(game.player.scoped ? SCOPED_FOV : FOV, this.camera.aspect);
      if (game.shake > 0) this.camera.rotation.z = Math.sin(this.animationTime * 120) * game.shake * .006;
    }
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.sun.position.copy(this.camera.position).add(this.sunOffset);
    this.sun.target.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.effects.root.visible = !preview;
    if (!preview) this.effects.update(game, delta, this.camera);
    this.scene.fog.density = this.effects.insideSmoke && !preview ? .14 : .006;
    this.composer.render(delta);
    if (!preview) {
      this.viewmodel.update(game, motion, delta, this.camera.aspect);
      if (this.viewmodel.scene.visible && !ownVehicle) {
        this.camera.getWorldDirection(this.forward);
        this.raycaster.set(this.camera.position, this.forward);
        this.raycaster.far = 1.5;
        const wall = this.raycaster.intersectObject(this.battlefield.collider)[0];
        if (wall) this.viewmodel.root.rotation.x -= (1 - wall.distance / 1.5) * .7;
        this.webgl.autoClear = false;
        this.webgl.clearDepth();
        this.webgl.toneMapping = THREE.ACESFilmicToneMapping;
        this.webgl.render(this.viewmodel.scene, this.viewmodel.camera);
        this.webgl.toneMapping = THREE.NoToneMapping;
        this.webgl.autoClear = true;
      }
      this.radarClock += delta;
      if (this.radarClock > .08 || delta === 0) { drawRadar(this.radar, game); this.radarClock = 0; }
    }
    this.samplePerformance(frameTime);
  }

  samplePerformance(dt) {
    if (!(dt > 0)) return;
    this.sampleTime += dt; this.sampleFrames++;
    if (this.sampleTime < 2) return;
    const fps = this.sampleFrames / this.sampleTime;
    this.lowPerformanceSamples = fps < 38 ? this.lowPerformanceSamples + 1 : 0;
    this.highPerformanceSamples = fps > 56 ? this.highPerformanceSamples + 1 : 0;
    let scale = this.pixelScale;
    if (this.lowPerformanceSamples >= 2) { scale = Math.max(.6, scale - .15); this.lowPerformanceSamples = 0; }
    if (this.highPerformanceSamples >= 4) { scale = Math.min(1, scale + .1); this.highPerformanceSamples = 0; }
    if (scale !== this.pixelScale) { this.pixelScale = scale; this.resize(); }
    this.stats = { fps: Math.round(fps), calls: this.webgl.info.render.calls, triangles: this.webgl.info.render.triangles, scale: this.pixelScale };
    this.canvas.dispatchEvent(new CustomEvent("render-stats", { detail: this.stats }));
    this.sampleTime = this.sampleFrames = 0;
  }

  triggerShot(payload, playerId) { this.effects.trigger(payload, playerId); if (payload.actorId === playerId) this.viewmodel.triggerShot(payload); }
  resetCombatEffects() { this.effects.clear(); this.viewmodel.kick = this.viewmodel.swing = this.viewmodel.flashTime = 0; }
  dispose() {
    window.removeEventListener("resize", this.onResize);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.battlefield?.dispose(); this.effects.dispose(); this.viewmodel.dispose(); this.modelBatch.dispose();
    this.composer.dispose(); this.environment.dispose(); this.resources.dispose(); this.webgl.dispose();
    this.scene.clear();
  }
}
