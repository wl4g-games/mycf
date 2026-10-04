import { GAME_MODES, LOADOUTS, MAPS, TEAM, THROWABLES, WEAPONS, distance, isSolid, normalizeAngle, spawnCells } from "./config.js?v=20261004-i18n";

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
    this.settings = { mapId: this.map.id, modeId: this.mode.id, loadoutId: this.client.self.loadoutId || "recon" };
    const spawn = spawnCells(this.map, this.assignment.team)[0];
    const loadout = LOADOUTS[this.settings.loadoutId] || LOADOUTS.recon;
    this.player = {
      id: this.assignment.actorId,
      name: this.client.self.alias,
      team: this.assignment.team,
      x: spawn[0] + .5,
      y: spawn[1] + .5,
      angle: this.assignment.team === TEAM.SEAL ? -Math.PI / 2 : Math.PI / 2,
      health: 100,
      alive: true,
      scoped: false,
      loadoutId: loadout.id,
      weaponSlot: "primary",
      weaponId: loadout.primary,
      throwableId: loadout.throwable,
      isPlayer: true,
    };
    this.actors = [this.player];
    this.localAngle = this.player.angle;
    this.time = 480;
    this.tank = { ...this.map.tank, turretAngle: this.map.tank.angle, health: 100, occupied: false, driverId: null, speed: 0 };
    this.started = true;
    this.finished = false;
  }

  applySnapshot(snapshot) {
    const previousHealth = this.player?.health ?? 100;
    const previousAlive = this.player?.alive ?? true;
    this.map = MAPS[snapshot.mapId] || this.map;
    this.mode = GAME_MODES[snapshot.modeId] || this.mode;
    this.time = snapshot.time;
    this.score = snapshot.score;
    this.finished = snapshot.finished;
    this.actors = snapshot.actors || [];
    this.tank = snapshot.tank;
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
  }

  handleCombatEvent(event) {
    if (event.type === "shot") {
      if (event.userId === this.client.self.id) {
        if (event.profile === "knife" || event.profile === "axe") this.audio.knife(event.profile);
        else this.audio.gunshot(event.profile);
        this.shake = event.profile === "sniper" ? .48 : event.profile === "machinegun" ? .25 : .18;
      } else {
        this.audio.distantShot(event.profile, 12);
      }
    }
    if (event.type === "tank_shot") { this.audio.tankShot(); this.shake = 1; }
    if (event.type === "explosion") { this.audio.explosion(event.explosionType); this.shake = Math.max(this.shake, .78); }
    if (event.type === "kill" && event.attackerUserId === this.client.self.id) { this.hitMarker = .16; this.audio.hit(); }
  }

  update(dt, input) {
    if (!this.started || this.finished || !this.player) return;
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.localAngle = normalizeAngle(this.localAngle + input.yaw);
    this.player.angle = this.localAngle;
    this.pendingActions.push(...input.items);
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

  predict(dt, movement) {
    if (!this.player.alive || this.tank.driverId === this.player.id) return;
    const speed = this.player.scoped ? 1.35 : 3.1;
    const forward = -movement.y;
    const strafe = movement.x;
    const dx = (Math.cos(this.localAngle) * forward + Math.cos(this.localAngle + Math.PI / 2) * strafe) * speed * dt;
    const dy = (Math.sin(this.localAngle) * forward + Math.sin(this.localAngle + Math.PI / 2) * strafe) * speed * dt;
    if (!isSolid(this.map, this.player.x + dx, this.player.y)) this.player.x += dx;
    if (!isSolid(this.map, this.player.x, this.player.y + dy)) this.player.y += dy;
  }

  get nearTank() { return !this.tank.occupied && this.tank.health > 0 && distance(this.player, this.tank) < 1.65; }
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
