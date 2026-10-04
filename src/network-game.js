import {
  DEFAULT_CHARACTER_ID, GAME_MODES, LOADOUTS, MAPS, MATCH_TIME, TEAM, THROWABLES, WEAPONS,
  distance, isSolid, normalizeAngle, resolveCharacterId, resolveMatchCondition, spawnCells,
} from "./config.js?v=20261005-content-v6";
import { applyCameraPitch } from "./camera.js?v=20261005-content-v6";
import {
  ACTOR_COLLISION_RADIUS, collidesWithVehicle, createVehicleStates, drivenVehicle,
  resolveInteractionVehicle,
} from "./vehicle-system.js?v=20261005-content-v6";

export class NetworkGameState {
  constructor(client, audio, emit = () => {}) {
    this.client = client;
    this.audio = audio;
    this.emit = emit;
    this.started = false;
    this.finished = false;
    this.pendingActions = [];
    this.sendClock = 0;
    this.localAngle = 0;
    this.localPitch = 0;
    this.hitMarker = 0;
    this.shake = 0;
    this.flash = 0;
    this.feed = [];
    this.actors = [];
    this.projectiles = [];
    this.effects = [];
    this.score = { seal: 0, terror: 0 };
  }

  start(payload) {
    const room = payload.room;
    this.assignment = payload.assignment;
    this.map = MAPS[room.mapId] || MAPS.city;
    this.mode = GAME_MODES[room.modeId] || GAME_MODES["4v4"];
    this.rules = resolveMatchCondition(room);
    this.settings = {
      mapId: this.map.id,
      modeId: this.mode.id,
      loadoutId: this.client.self.loadoutId || "recon",
      characterId: resolveCharacterId(this.client.self.characterId || DEFAULT_CHARACTER_ID),
      ...this.rules,
    };
    const spawn = spawnCells(this.map, this.assignment.team)[0];
    const loadout = LOADOUTS[this.settings.loadoutId] || LOADOUTS.recon;
    this.player = {
      id: this.assignment.actorId,
      name: this.client.self.alias,
      team: this.assignment.team,
      x: spawn[0] + .5,
      y: spawn[1] + .5,
      angle: this.assignment.team === TEAM.SEAL ? -Math.PI / 2 : Math.PI / 2,
      pitch: 0,
      health: 100,
      alive: true,
      scoped: false,
      characterId: this.settings.characterId,
      loadoutId: loadout.id,
      weaponSlot: "primary",
      weaponId: loadout.primary,
      throwableId: loadout.throwable,
      isPlayer: true,
    };
    this.actors = [this.player];
    this.localAngle = this.player.angle;
    this.localPitch = 0;
    this.time = Number(payload.duration) || this.rules.timeLimit || MATCH_TIME;
    this.vehicles = createVehicleStates(this.map);
    this.syncVehicleAliases();
    this.started = true;
    this.finished = false;
  }

  syncVehicleAliases() {
    this.tank = this.vehicles.find(vehicle => vehicle.type === "tank") || this.vehicles[0];
    this.armoredCar = this.vehicles.find(vehicle => vehicle.type === "armoredCar") || null;
  }

  applySnapshot(snapshot) {
    const previousHealth = this.player?.health ?? 100;
    const previousAlive = this.player?.alive ?? true;
    this.map = MAPS[snapshot.mapId] || this.map;
    this.mode = GAME_MODES[snapshot.modeId] || this.mode;
    this.rules = resolveMatchCondition({ conditionId: snapshot.conditionId || this.rules.id });
    this.time = snapshot.time;
    this.score = snapshot.score;
    this.finished = snapshot.finished;
    this.actors = snapshot.actors || [];
    this.vehicles = Array.isArray(snapshot.vehicles) && snapshot.vehicles.length
      ? snapshot.vehicles
      : snapshot.tank ? [{ type: "tank", ...snapshot.tank }] : this.vehicles;
    this.syncVehicleAliases();
    this.projectiles = snapshot.projectiles || [];
    this.effects = snapshot.effects || [];
    this.feed = snapshot.feed || [];
    this.player = this.actors.find(actor => actor.id === snapshot.playerId) || this.player;
    if (!this.player) return;
    this.player.isPlayer = true;
    if (previousHealth > this.player.health) this.flash = .34;
    if (previousAlive && !this.player.alive) this.emit("death", { respawn: this.player.respawn });
    if (!previousAlive && this.player.alive) this.emit("respawn");
    if (Math.abs(normalizeAngle(this.localAngle - this.player.angle)) > .75) this.localAngle = this.player.angle;
    this.player.angle = this.localAngle;
    this.player.pitch = this.localPitch;
  }

  handleCombatEvent(event) {
    if (event.type === "shot") {
      const localShot = event.userId === this.client.self.id;
      this.audio.weaponShot({
        weaponId: event.weaponId || this.player?.weaponId,
        profile: event.profile,
        source: localShot ? undefined : event.from,
        listener: localShot ? undefined : this.player,
        hit: Boolean(event.hit),
      });
      if (localShot) {
        this.shake = event.profile === "sniper" ? .48 : event.profile === "machinegun" ? .25 : .18;
      }
      if (event.hit && event.victimId === this.player?.id) this.flash = Math.max(this.flash, .28);
      this.emit("shot", {
        ...event,
        weaponId: event.weaponId || this.player?.weaponId,
      });
    }
    if (event.type === "grenade_throw") this.emit("grenade_throw", event);
    if (event.type === "tank_shot") {
      const localShot = event.userId === this.client.self.id;
      this.audio.tankShot({
        source: localShot ? undefined : event,
        listener: localShot ? undefined : this.player,
      });
      if (localShot) this.shake = 1;
      else {
        const shotDistance = distance(event, this.player);
        if (shotDistance < 32) this.shake = Math.max(this.shake, (1 - shotDistance / 32) * .34);
      }
    }
    if (event.type === "explosion") {
      this.audio.explosion(event.explosionType, { source: event, listener: this.player });
      this.shake = Math.max(this.shake, .78);
    }
    if (event.type === "shot" && event.hit && event.userId === this.client.self.id) {
      this.hitMarker = .16;
      this.audio.hit();
    }
  }

  update(dt, input) {
    if (!this.started || this.finished || !this.player) return;
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.localAngle = normalizeAngle(this.localAngle + input.yaw);
    this.localPitch = applyCameraPitch(this.localPitch, input.pitch);
    this.player.angle = this.localAngle;
    this.player.pitch = this.localPitch;
    for (const action of input.items) {
      if (action[0] !== "interact" || action[1]) {
        this.pendingActions.push(action);
        continue;
      }
      this.pendingActions.push(["interact", this.interactionVehicle?.id || null]);
    }
    this.predict(dt, input.movement);
    this.sendClock += dt;
    if (this.sendClock < .05) return;
    this.sendClock = 0;
    this.client.sendInput({
      movement: input.movement,
      angle: this.localAngle,
      fireHeld: input.fireHeld,
      actions: this.pendingActions.splice(0),
    });
  }

  suspendInput() {
    if (!this.started || this.finished || !this.player) return;
    this.pendingActions.length = 0;
    this.sendClock = 0;
    this.client.sendInput({
      movement: { x: 0, y: 0 },
      angle: this.localAngle,
      fireHeld: false,
      actions: [],
    });
  }

  predict(dt, movement) {
    if (!this.player.alive || this.currentVehicle) return;
    const speed = this.player.scoped ? 1.35 : 3.1;
    const forward = -movement.y;
    const strafe = movement.x;
    const dx = (Math.cos(this.localAngle) * forward + Math.cos(this.localAngle + Math.PI / 2) * strafe) * speed * dt;
    const dy = (Math.sin(this.localAngle) * forward + Math.sin(this.localAngle + Math.PI / 2) * strafe) * speed * dt;
    if (!this.collides(this.player.x + dx, this.player.y, ACTOR_COLLISION_RADIUS)) this.player.x += dx;
    if (!this.collides(this.player.x, this.player.y + dy, ACTOR_COLLISION_RADIUS)) this.player.y += dy;
  }

  collides(x, y, radius) {
    return isSolid(this.map, x - radius, y - radius)
      || isSolid(this.map, x + radius, y - radius)
      || isSolid(this.map, x - radius, y + radius)
      || isSolid(this.map, x + radius, y + radius)
      || collidesWithVehicle(this.vehicles, x, y, radius);
  }

  get currentVehicle() { return drivenVehicle(this.vehicles || [], this.player?.id); }
  get interactionVehicle() { return this.currentVehicle || resolveInteractionVehicle(this.vehicles || [], this.player); }
  get nearVehicle() { return Boolean(this.interactionVehicle); }
  get nearTank() { return this.nearVehicle; }
  get currentLoadout() { return LOADOUTS[this.player.loadoutId] || LOADOUTS.recon; }
  get currentWeapon() { return WEAPONS[this.player.weaponId] || WEAPONS.ak47; }
  get currentThrowable() { return THROWABLES[this.player.throwableId] || THROWABLES.firework; }
  get aliveCounts() {
    return {
      seal: this.actors.filter(actor => actor.team === TEAM.SEAL && actor.alive).length,
      terror: this.actors.filter(actor => actor.team === TEAM.TERROR && actor.alive).length,
    };
  }
}
