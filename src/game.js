import { BOT_NAMES, MATCH_LIMIT, MATCH_TIME, SPAWNS, TEAM, WEAPON, clamp, distance, isSolid, normalizeAngle } from "./config.js";

const randomItem = list => list[Math.floor(Math.random() * list.length)];

export class GameState {
  constructor(audio, emit = () => {}) {
    this.audio = audio;
    this.emit = emit;
    this.round = 0;
    this.reset();
  }

  reset() {
    this.round += 1;
    this.time = MATCH_TIME;
    this.score = { [TEAM.SEAL]: 0, [TEAM.TERROR]: 0 };
    this.finished = false;
    this.started = false;
    this.hitMarker = 0;
    this.shake = 0;
    this.flash = 0;
    this.projectiles = [];
    this.explosions = [];
    this.feed = [];
    this.actors = [];
    this.createTeams();
    this.tank = { x: 18.4, y: 15.2, angle: -Math.PI / 2, turretAngle: -Math.PI / 2, health: 100, occupied: false, speed: 0, cooldown: 0 };
  }

  createTeams() {
    for (const team of [TEAM.SEAL, TEAM.TERROR]) {
      for (let index = 0; index < 4; index += 1) {
        const [x, y] = SPAWNS[team][index];
        this.actors.push({
          id: `${team}-${index}`, name: BOT_NAMES[team][index], team, index,
          x: x + .5, y: y + .5, angle: team === TEAM.SEAL ? -Math.PI / 2 : Math.PI / 2,
          health: 100, alive: true, respawn: 0, cooldown: Math.random(), decision: Math.random(),
          strafe: Math.random() > .5 ? 1 : -1, isPlayer: team === TEAM.SEAL && index === 0,
          weapon: WEAPON.SNIPER, scoped: false, kills: 0, deaths: 0,
        });
      }
    }
    this.player = this.actors[0];
  }

  start() { this.started = true; }

  update(dt, input) {
    if (!this.started || this.finished) return;
    dt = Math.min(dt, .04);
    this.time = Math.max(0, this.time - dt);
    this.hitMarker = Math.max(0, this.hitMarker - dt);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.tank.cooldown = Math.max(0, this.tank.cooldown - dt);
    this.player.angle = normalizeAngle(this.player.angle + input.yaw);
    if (this.tank.occupied) this.tank.turretAngle = this.player.angle;

    for (const action of input.items) this.handleAction(action);
    if (this.player.alive) this.updatePlayer(dt, input.movement, input.fireHeld);
    this.updateBots(dt);
    this.updateProjectiles(dt);
    this.updateRespawns(dt);
    this.explosions = this.explosions.filter(explosion => (explosion.life -= dt) > 0);

    if (this.time <= 0) this.finish(this.score.seal >= this.score.terror ? TEAM.SEAL : TEAM.TERROR);
  }

  handleAction([type, value]) {
    if (type === "weapon" && this.player.alive && !this.tank.occupied) {
      this.player.weapon = value;
      this.player.scoped = false;
      this.audio.select();
      this.emit("weapon", value);
    }
    if (type === "scope" && this.player.alive && this.player.weapon === WEAPON.SNIPER && !this.tank.occupied) {
      this.player.scoped = !this.player.scoped;
      this.audio.select();
    }
    if (type === "grenade" && this.player.alive && !this.tank.occupied) this.throwGrenade(this.player);
    if (type === "interact" && this.player.alive) this.toggleTank();
    if (type === "fire" && this.player.alive) this.attack(this.player);
  }

  updatePlayer(dt, movement, fireHeld) {
    this.player.cooldown = Math.max(0, this.player.cooldown - dt);
    if (this.tank.occupied) {
      const drive = -movement.y;
      const steer = movement.x;
      this.tank.speed += (drive * 3.5 - this.tank.speed * 2.2) * dt;
      this.tank.speed = clamp(this.tank.speed, -1.3, 2.5);
      this.tank.angle = normalizeAngle(this.tank.angle + steer * dt * (1.25 + Math.abs(this.tank.speed) * .2));
      this.moveEntity(this.tank, Math.cos(this.tank.angle) * this.tank.speed * dt, Math.sin(this.tank.angle) * this.tank.speed * dt, .62);
      this.player.x = this.tank.x;
      this.player.y = this.tank.y;
      if (fireHeld) this.fireTank();
      return;
    }

    const speed = this.player.scoped ? 1.35 : 2.75;
    const forward = -movement.y;
    const strafe = movement.x;
    const dx = (Math.cos(this.player.angle) * forward + Math.cos(this.player.angle + Math.PI / 2) * strafe) * speed * dt;
    const dy = (Math.sin(this.player.angle) * forward + Math.sin(this.player.angle + Math.PI / 2) * strafe) * speed * dt;
    this.moveEntity(this.player, dx, dy, .24);
    if (fireHeld && this.player.weapon !== WEAPON.GRENADE) this.attack(this.player);
  }

  attack(actor) {
    if (actor.cooldown > 0 || !actor.alive) return;
    if (actor.weapon === WEAPON.GRENADE) { this.throwGrenade(actor); return; }
    if (actor.weapon === WEAPON.KNIFE) {
      actor.cooldown = .52;
      this.audio.knife();
      const victim = this.findTargetInArc(actor, 1.65, .82);
      if (victim) this.damage(victim, 72, actor, "军刀");
      return;
    }
    actor.cooldown = .82;
    this.audio.gunshot();
    this.shake = .46;
    const victim = this.findTargetInArc(actor, 30, actor.scoped ? .025 : .055);
    if (victim) this.damage(victim, 115, actor, "巴雷特");
  }

  findTargetInArc(actor, range, margin) {
    let selected = null;
    let best = Infinity;
    for (const target of this.actors) {
      if (!target.alive || target.team === actor.team || target === actor) continue;
      const rangeToTarget = distance(actor, target);
      if (rangeToTarget > range || !this.hasLineOfSight(actor, target)) continue;
      const angle = Math.abs(normalizeAngle(Math.atan2(target.y - actor.y, target.x - actor.x) - actor.angle));
      const allowed = Math.max(margin, Math.atan(.3 / rangeToTarget));
      if (angle < allowed && angle + rangeToTarget * .0005 < best) { selected = target; best = angle + rangeToTarget * .0005; }
    }
    return selected;
  }

  throwGrenade(actor) {
    if (actor.cooldown > 0) return;
    actor.cooldown = .62;
    if (actor.isPlayer) this.audio.select();
    this.projectiles.push({
      type: "grenade", x: actor.x + Math.cos(actor.angle) * .45, y: actor.y + Math.sin(actor.angle) * .45,
      z: .65, vx: Math.cos(actor.angle) * 5.5, vy: Math.sin(actor.angle) * 5.5, vz: 3.2,
      life: 1.65, owner: actor, team: actor.team,
    });
  }

  fireTank() {
    if (this.tank.cooldown > 0) return;
    this.tank.cooldown = 1.05;
    this.audio.tankShot();
    this.shake = 1;
    this.projectiles.push({
      type: "shell", x: this.tank.x + Math.cos(this.tank.turretAngle), y: this.tank.y + Math.sin(this.tank.turretAngle), z: .65,
      vx: Math.cos(this.tank.turretAngle) * 12, vy: Math.sin(this.tank.turretAngle) * 12, vz: 0,
      life: 2.8, owner: this.player, team: TEAM.SEAL,
    });
  }

  toggleTank() {
    if (this.tank.occupied) {
      this.tank.occupied = false;
      const side = this.tank.angle + Math.PI / 2;
      const exit = { x: this.tank.x + Math.cos(side) * 1.1, y: this.tank.y + Math.sin(side) * 1.1 };
      if (!isSolid(exit.x, exit.y)) { this.player.x = exit.x; this.player.y = exit.y; }
      this.emit("announce", "已离开坦克");
      return;
    }
    if (distance(this.player, this.tank) < 1.55 && this.tank.health > 0) {
      this.tank.occupied = true;
      this.player.scoped = false;
      this.player.x = this.tank.x; this.player.y = this.tank.y;
      this.emit("announce", "M-77 主战坦克已启动");
    }
  }

  updateBots(dt) {
    for (const bot of this.actors) {
      if (bot.isPlayer || !bot.alive) continue;
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      bot.decision -= dt;
      const enemies = this.actors.filter(actor => actor.alive && actor.team !== bot.team);
      if (!enemies.length) continue;
      const target = enemies.reduce((best, actor) => distance(bot, actor) < distance(bot, best) ? actor : best, enemies[0]);
      const targetAngle = Math.atan2(target.y - bot.y, target.x - bot.x);
      bot.angle = normalizeAngle(bot.angle + clamp(normalizeAngle(targetAngle - bot.angle), -dt * 2.6, dt * 2.6));
      const range = distance(bot, target);
      const visible = range < 15 && this.hasLineOfSight(bot, target);
      if (bot.decision <= 0) { bot.decision = .7 + Math.random() * 1.3; bot.strafe *= Math.random() > .3 ? 1 : -1; }

      let forward = range > (visible ? 5.2 : 1.4) ? 1 : range < 2.8 ? -.65 : 0;
      let strafe = visible ? bot.strafe * .45 : 0;
      const speed = 1.15 + bot.index * .06;
      const dx = (Math.cos(bot.angle) * forward + Math.cos(bot.angle + Math.PI / 2) * strafe) * speed * dt;
      const dy = (Math.sin(bot.angle) * forward + Math.sin(bot.angle + Math.PI / 2) * strafe) * speed * dt;
      if (!this.moveEntity(bot, dx, dy, .22)) bot.strafe *= -1;

      if (visible && range < 11 && Math.abs(normalizeAngle(targetAngle - bot.angle)) < .18 && bot.cooldown <= 0) {
        bot.cooldown = .58 + Math.random() * .5;
        if (Math.random() < clamp(.82 - range * .045, .22, .72)) this.damage(target, 8 + Math.random() * 8, bot, "步枪");
      }
      if (Math.random() < dt * .018 && range < 9) this.throwGrenade(bot);
    }
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      const nextX = projectile.x + projectile.vx * dt;
      const nextY = projectile.y + projectile.vy * dt;
      let collided = false;
      if (isSolid(nextX, projectile.y)) { projectile.vx *= projectile.type === "grenade" ? -.48 : 0; collided = true; }
      else projectile.x = nextX;
      if (isSolid(projectile.x, nextY)) { projectile.vy *= projectile.type === "grenade" ? -.48 : 0; collided = true; }
      else projectile.y = nextY;
      if (projectile.type === "grenade") {
        projectile.vz -= 7.8 * dt;
        projectile.z += projectile.vz * dt;
        if (projectile.z < .06) { projectile.z = .06; projectile.vz *= -.42; projectile.vx *= .72; projectile.vy *= .72; }
      }
      if (projectile.type === "shell" && collided) projectile.life = 0;
      if (projectile.life <= 0) this.explode(projectile);
    }
    this.projectiles = this.projectiles.filter(projectile => projectile.life > 0);
  }

  explode(projectile) {
    const radius = projectile.type === "shell" ? 4.2 : 3.5;
    const power = projectile.type === "shell" ? 190 : 128;
    this.explosions.push({ x: projectile.x, y: projectile.y, life: .55, maxLife: .55, radius });
    this.audio.explosion();
    this.shake = Math.max(this.shake, .75);
    for (const actor of this.actors) {
      if (!actor.alive || actor.team === projectile.team) continue;
      const range = distance(actor, projectile);
      if (range < radius && this.hasLineOfSight(projectile, actor)) this.damage(actor, power * (1 - range / radius), projectile.owner, projectile.type === "shell" ? "坦克主炮" : "手雷");
    }
  }

  damage(target, amount, attacker, weapon) {
    if (!target.alive || target.team === attacker.team) return;
    if (target.isPlayer && this.tank.occupied) {
      this.tank.health = Math.max(0, this.tank.health - amount * .65);
      this.flash = .35;
      if (this.tank.health <= 0) { this.tank.occupied = false; this.damage(target, 200, attacker, weapon); }
      return;
    }
    target.health -= amount;
    if (target.isPlayer) this.flash = .34;
    if (attacker.isPlayer) { this.hitMarker = .16; this.audio.hit(); }
    if (target.health <= 0) this.kill(target, attacker, weapon);
  }

  kill(victim, attacker, weapon) {
    victim.health = 0; victim.alive = false; victim.respawn = 3.2; victim.deaths += 1; victim.scoped = false;
    attacker.kills += 1;
    this.score[attacker.team] += 1;
    const entry = { killer: attacker.name, killerTeam: attacker.team, victim: victim.name, victimTeam: victim.team, weapon, life: 5 };
    this.feed.unshift(entry); this.feed = this.feed.slice(0, 5);
    this.emit("kill", entry);
    if (victim.isPlayer) { this.tank.occupied = false; this.emit("death", { respawn: victim.respawn }); }
    if (this.score[attacker.team] >= MATCH_LIMIT) this.finish(attacker.team);
  }

  updateRespawns(dt) {
    for (const actor of this.actors) {
      if (actor.alive) continue;
      actor.respawn -= dt;
      if (actor.respawn <= 0 && !this.finished) this.respawn(actor);
    }
    for (const entry of this.feed) entry.life -= dt;
    this.feed = this.feed.filter(entry => entry.life > 0);
  }

  respawn(actor) {
    const [x, y] = randomItem(SPAWNS[actor.team]);
    actor.x = x + .5; actor.y = y + .5; actor.health = 100; actor.alive = true; actor.cooldown = .6;
    actor.angle = actor.team === TEAM.SEAL ? -Math.PI / 2 : Math.PI / 2;
    if (actor.isPlayer) this.emit("respawn");
  }

  finish(winner) {
    if (this.finished) return;
    this.finished = true;
    this.emit("finish", { winner, score: { ...this.score } });
  }

  moveEntity(entity, dx, dy, radius) {
    let moved = false;
    if (!this.collides(entity.x + dx, entity.y, radius)) { entity.x += dx; moved = moved || Math.abs(dx) > 0; }
    if (!this.collides(entity.x, entity.y + dy, radius)) { entity.y += dy; moved = moved || Math.abs(dy) > 0; }
    return moved;
  }

  collides(x, y, radius) {
    return isSolid(x - radius, y - radius) || isSolid(x + radius, y - radius) || isSolid(x - radius, y + radius) || isSolid(x + radius, y + radius);
  }

  hasLineOfSight(from, to) {
    const length = distance(from, to);
    const steps = Math.ceil(length / .12);
    for (let step = 1; step < steps; step += 1) {
      const ratio = step / steps;
      if (isSolid(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio)) return false;
    }
    return true;
  }

  get nearTank() { return !this.tank.occupied && this.tank.health > 0 && distance(this.player, this.tank) < 1.55; }
  get aliveCounts() {
    return {
      seal: this.actors.filter(actor => actor.team === TEAM.SEAL && actor.alive).length,
      terror: this.actors.filter(actor => actor.team === TEAM.TERROR && actor.alive).length,
    };
  }
}
