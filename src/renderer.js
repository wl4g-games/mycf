import { FOV, MAP_HEIGHT, MAP_WIDTH, SCOPED_FOV, TEAM, TILE_MAP, WEAPON, clamp, normalizeAngle, tileAt } from "./config.js";

const COLORS = {
  seal: "#65e6ef",
  terror: "#ff654e",
  bone: "#d5c9a5",
};

export class Renderer {
  constructor(canvas, radar) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false });
    this.radar = radar;
    this.radarContext = radar.getContext("2d");
    this.depth = new Float32Array(1);
    this.width = 0;
    this.height = 0;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const pixelRatio = Math.min(devicePixelRatio || 1, innerWidth < 900 ? 1.2 : 1.45);
    const width = Math.round(innerWidth * pixelRatio);
    const height = Math.round(innerHeight * pixelRatio);
    if (width === this.width && height === this.height) return;
    this.canvas.width = this.width = width;
    this.canvas.height = this.height = height;
    this.depth = new Float32Array(width);
  }

  render(game) {
    const { context: ctx, width, height } = this;
    const player = game.player;
    const fov = player.scoped ? SCOPED_FOV : FOV;
    const focal = width / (2 * Math.tan(fov / 2));
    const horizon = height * .48;
    const shake = game.shake > 0 ? game.shake * 5 : 0;
    ctx.save();
    ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    this.drawBackdrop(ctx, width, height, horizon);
    this.drawWalls(game, fov, focal, horizon);
    this.drawWorldSprites(game, focal, horizon, fov);
    this.drawWeapon(game);
    if (game.flash > 0) {
      ctx.fillStyle = `rgba(190,20,10,${game.flash * .42})`;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
    this.drawRadar(game);
  }

  drawBackdrop(ctx, width, height, horizon) {
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#050d15"); sky.addColorStop(.6, "#142b37"); sky.addColorStop(1, "#31515a");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, horizon);
    const ceilingGlow = ctx.createRadialGradient(width * .5, horizon * .25, 0, width * .5, horizon * .25, width * .65);
    ceilingGlow.addColorStop(0, "rgba(91,190,202,.17)"); ceilingGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ceilingGlow; ctx.fillRect(0, 0, width, horizon);
    ctx.fillStyle = "rgba(154,218,221,.12)";
    for (let x = width * .08; x < width; x += width * .16) ctx.fillRect(x, height * .07, width * .065, 2);

    const floor = ctx.createLinearGradient(0, horizon, 0, height);
    floor.addColorStop(0, "#25353a"); floor.addColorStop(.28, "#172429"); floor.addColorStop(1, "#071014");
    ctx.fillStyle = floor; ctx.fillRect(0, horizon, width, height - horizon);
    ctx.strokeStyle = "rgba(110,180,184,.09)"; ctx.lineWidth = 1;
    for (let row = 1; row < 11; row += 1) {
      const y = horizon + (1 - 1 / (1 + row * .34)) * (height - horizon);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    for (let x = -width; x < width * 2; x += width / 12) {
      ctx.beginPath(); ctx.moveTo(width / 2, horizon); ctx.lineTo(x, height); ctx.stroke();
    }
  }

  drawWalls(game, fov, focal, horizon) {
    const { context: ctx, width, height } = this;
    const player = game.player;
    const columnWidth = width > 1600 ? 3 : 2;
    for (let screenX = 0; screenX < width; screenX += columnWidth) {
      const cameraX = screenX / width * 2 - 1;
      const rayAngle = player.angle + Math.atan(cameraX * Math.tan(fov / 2));
      const hit = this.castRay(player.x, player.y, rayAngle);
      const corrected = Math.max(.001, hit.distance * Math.cos(rayAngle - player.angle));
      const baseHeight = focal / corrected;
      const wallScale = hit.tile === "G" ? .55 : hit.tile === "C" ? 1.35 : 1;
      const wallHeight = Math.min(height * 2, baseHeight * wallScale);
      const bottom = horizon + baseHeight * .5;
      const top = bottom - wallHeight;
      const shade = clamp(1 - corrected / 24, .2, .95) * (hit.side ? .72 : 1);
      ctx.fillStyle = this.wallColor(hit.tile, shade, hit.wallX);
      ctx.fillRect(screenX, top, columnWidth + 1, wallHeight);
      if (hit.tile === "G") {
        ctx.fillStyle = `rgba(125,239,239,${.1 + shade * .08})`;
        ctx.fillRect(screenX, top + wallHeight * .08, columnWidth, wallHeight * .68);
        if (Math.floor(hit.wallX * 8) % 7 === 0) { ctx.fillStyle = `rgba(205,255,255,${shade * .35})`; ctx.fillRect(screenX, top, 1, wallHeight); }
      } else if (Math.floor(hit.wallX * 12) === 0) {
        ctx.fillStyle = `rgba(255,255,255,${shade * .07})`;
        ctx.fillRect(screenX, top, 1, wallHeight);
      }
      for (let offset = 0; offset < columnWidth && screenX + offset < width; offset += 1) this.depth[screenX + offset] = corrected;
    }
  }

  wallColor(tile, shade, wallX) {
    if (tile === "G") return `rgba(${Math.floor(29 * shade)},${Math.floor(91 * shade)},${Math.floor(98 * shade)},.92)`;
    if (tile === "C") return `rgb(${Math.floor(107 * shade)},${Math.floor(99 * shade)},${Math.floor(81 * shade)})`;
    const seam = Math.floor(wallX * 6) % 2 ? 1 : .88;
    return `rgb(${Math.floor(73 * shade * seam)},${Math.floor(88 * shade * seam)},${Math.floor(91 * shade * seam)})`;
  }

  castRay(x, y, angle) {
    const rayX = Math.cos(angle), rayY = Math.sin(angle);
    let mapX = Math.floor(x), mapY = Math.floor(y), side = 0, tile = "#";
    const deltaX = rayX === 0 ? 1e30 : Math.abs(1 / rayX);
    const deltaY = rayY === 0 ? 1e30 : Math.abs(1 / rayY);
    const stepX = rayX < 0 ? -1 : 1, stepY = rayY < 0 ? -1 : 1;
    let sideX = rayX < 0 ? (x - mapX) * deltaX : (mapX + 1 - x) * deltaX;
    let sideY = rayY < 0 ? (y - mapY) * deltaY : (mapY + 1 - y) * deltaY;
    for (let step = 0; step < 64; step += 1) {
      if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
      else { sideY += deltaY; mapY += stepY; side = 1; }
      tile = tileAt(mapX, mapY);
      if (tile !== ".") break;
    }
    const distance = side ? sideY - deltaY : sideX - deltaX;
    const exact = side ? x + distance * rayX : y + distance * rayY;
    return { distance, tile, side, wallX: exact - Math.floor(exact) };
  }

  drawWorldSprites(game, focal, horizon, fov) {
    const sprites = [
      { kind: "dinosaur", x: 12, y: 8.55 },
      ...game.actors.filter(actor => actor.alive && !actor.isPlayer).map(actor => ({ ...actor, kind: "actor" })),
      ...game.projectiles.map(projectile => ({ ...projectile, kind: projectile.type })),
      ...game.explosions.map(explosion => ({ ...explosion, kind: "explosion" })),
    ];
    if (!game.tank.occupied) sprites.push({ ...game.tank, kind: "tank" });
    const projected = sprites.map(sprite => ({ sprite, ...this.project(sprite, game.player, focal, horizon) })).filter(item => item.forward > .15 && Math.abs(item.delta) < fov * .78);
    projected.sort((a, b) => b.forward - a.forward);
    for (const item of projected) {
      const center = Math.floor(item.x);
      if (center < 0 || center >= this.width || this.depth[center] + .25 < item.forward) continue;
      this.context.save();
      if (item.sprite.kind === "actor") this.drawActor(item);
      if (item.sprite.kind === "dinosaur") this.drawDinosaur(item);
      if (item.sprite.kind === "tank") this.drawTank(item);
      if (item.sprite.kind === "grenade" || item.sprite.kind === "shell") this.drawProjectile(item);
      if (item.sprite.kind === "explosion") this.drawExplosion(item);
      this.context.restore();
    }
  }

  project(sprite, player, focal, horizon) {
    const dx = sprite.x - player.x, dy = sprite.y - player.y;
    const forward = dx * Math.cos(player.angle) + dy * Math.sin(player.angle);
    const lateral = -dx * Math.sin(player.angle) + dy * Math.cos(player.angle);
    return {
      forward,
      delta: normalizeAngle(Math.atan2(dy, dx) - player.angle),
      x: this.width / 2 + lateral / Math.max(.01, forward) * focal,
      ground: horizon + focal * .5 / Math.max(.01, forward),
      unit: focal / Math.max(.01, forward),
    };
  }

  drawActor({ sprite, x, ground, unit, forward }) {
    const ctx = this.context;
    const height = unit * 1.02, width = height * .36;
    const top = ground - height;
    const teamColor = COLORS[sprite.team];
    const fog = clamp(1 - forward / 23, .32, 1);
    ctx.globalAlpha = fog;
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath(); ctx.ellipse(x, ground, width * .72, width * .16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#0b1113"; ctx.lineWidth = Math.max(1, width * .13); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x - width * .15, top + height * .7); ctx.lineTo(x - width * .22, ground); ctx.moveTo(x + width * .12, top + height * .7); ctx.lineTo(x + width * .25, ground); ctx.stroke();
    ctx.fillStyle = sprite.team === TEAM.SEAL ? "#203b43" : "#4c3029";
    ctx.beginPath(); ctx.moveTo(x - width * .43, top + height * .27); ctx.lineTo(x + width * .4, top + height * .27); ctx.lineTo(x + width * .32, top + height * .73); ctx.lineTo(x - width * .3, top + height * .73); ctx.closePath(); ctx.fill();
    ctx.fillStyle = sprite.team === TEAM.SEAL ? "#41616a" : "#765043";
    ctx.fillRect(x - width * .47, top + height * .39, width * .94, height * .11);
    ctx.fillStyle = "#aa8b73";
    ctx.beginPath(); ctx.arc(x, top + height * .18, width * .28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#10191c"; ctx.fillRect(x - width * .31, top + height * .08, width * .62, height * .09);
    ctx.strokeStyle = "#182329"; ctx.lineWidth = Math.max(1, width * .1);
    ctx.beginPath(); ctx.moveTo(x - width * .34, top + height * .37); ctx.lineTo(x + width * .55, top + height * .55); ctx.stroke();
    ctx.strokeStyle = teamColor; ctx.lineWidth = Math.max(1, width * .04); ctx.strokeRect(x - width * .42, top + height * .27, width * .84, height * .46);
    if (forward < 12) {
      const barWidth = width * 1.1;
      ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(x - barWidth / 2, top - height * .12, barWidth, 3);
      ctx.fillStyle = teamColor; ctx.fillRect(x - barWidth / 2, top - height * .12, barWidth * clamp(sprite.health / 100, 0, 1), 3);
      ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = `${Math.max(8, width * .17)}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(sprite.name, x, top - height * .16);
    }
  }

  drawDinosaur({ x, ground, unit, forward }) {
    const ctx = this.context;
    const width = unit * 4.1, height = unit * 1.85;
    const left = x - width * .5, top = ground - height * .78;
    ctx.globalAlpha = clamp(1.1 - forward / 28, .28, .92);
    ctx.strokeStyle = COLORS.bone; ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, unit * .065);
    ctx.shadowColor = "rgba(240,220,165,.35)"; ctx.shadowBlur = unit * .12;
    ctx.beginPath();
    ctx.moveTo(left + width * .05, top + height * .32);
    ctx.bezierCurveTo(left + width * .28, top + height * .18, left + width * .52, top + height * .4, left + width * .8, top + height * .28);
    ctx.stroke();
    ctx.shadowBlur = 0;
    for (let index = 0; index < 13; index += 1) {
      const ratio = index / 13, spineX = left + width * (.18 + ratio * .61), spineY = top + height * (.24 + Math.sin(ratio * Math.PI) * .13);
      ctx.lineWidth = Math.max(1, unit * .025);
      ctx.beginPath(); ctx.moveTo(spineX, spineY); ctx.quadraticCurveTo(spineX - unit * .08, spineY + height * .38, spineX + unit * .05, spineY + height * .48); ctx.stroke();
    }
    ctx.lineWidth = Math.max(1, unit * .07);
    ctx.beginPath(); ctx.moveTo(left + width * .6, top + height * .4); ctx.lineTo(left + width * .58, ground); ctx.moveTo(left + width * .72, top + height * .36); ctx.lineTo(left + width * .78, ground); ctx.stroke();
    ctx.lineWidth = Math.max(1, unit * .035);
    ctx.beginPath(); ctx.moveTo(left + width * .7, top + height * .42); ctx.lineTo(left + width * .84, top + height * .67); ctx.lineTo(left + width * .9, top + height * .63); ctx.stroke();
    ctx.fillStyle = COLORS.bone;
    ctx.beginPath(); ctx.moveTo(left + width * .78, top + height * .17); ctx.lineTo(left + width * .98, top + height * .23); ctx.lineTo(left + width, top + height * .38); ctx.lineTo(left + width * .81, top + height * .35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#182024"; ctx.beginPath(); ctx.arc(left + width * .91, top + height * .25, Math.max(1, unit * .035), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(91,216,224,.26)"; ctx.lineWidth = Math.max(1, unit * .02);
    ctx.beginPath(); ctx.moveTo(left + width * .2, ground); ctx.lineTo(left + width * .2, top); ctx.moveTo(left + width * .78, ground); ctx.lineTo(left + width * .78, top); ctx.stroke();
  }

  drawTank({ sprite, x, ground, unit, forward }) {
    const ctx = this.context;
    const width = unit * 1.7, height = unit * .82, top = ground - height;
    ctx.globalAlpha = clamp(1.1 - forward / 25, .28, 1);
    ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(x, ground, width * .55, height * .12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#182c27"; ctx.beginPath(); ctx.moveTo(x-width*.52,top+height*.45);ctx.lineTo(x+width*.52,top+height*.45);ctx.lineTo(x+width*.43,ground);ctx.lineTo(x-width*.45,ground);ctx.closePath();ctx.fill();
    ctx.fillStyle = "#3e5749"; ctx.fillRect(x-width*.3,top+height*.25,width*.6,height*.34);
    ctx.strokeStyle="#0b1211";ctx.lineWidth=Math.max(2,unit*.11);ctx.beginPath();ctx.moveTo(x-width*.43,top+height*.62);ctx.lineTo(x-width*.38,ground);ctx.moveTo(x+width*.43,top+height*.62);ctx.lineTo(x+width*.38,ground);ctx.stroke();
    const barrelAngle = normalizeAngle(sprite.turretAngle - sprite.angle);
    const barrelX = Math.sin(barrelAngle) * width * .22;
    ctx.strokeStyle="#263d35";ctx.lineWidth=Math.max(2,unit*.12);ctx.beginPath();ctx.moveTo(x,top+height*.3);ctx.lineTo(x+barrelX,top-height*.2);ctx.stroke();
    ctx.fillStyle = "#729678"; ctx.beginPath();ctx.ellipse(x,top+height*.3,width*.24,height*.16,0,0,Math.PI*2);ctx.fill();
    if (forward < 8) { ctx.fillStyle="rgba(104,232,239,.7)";ctx.font=`${Math.max(8,unit*.12)}px sans-serif`;ctx.textAlign="center";ctx.fillText("M-77",x,top-height*.12); }
  }

  drawProjectile({ sprite, x, ground, unit }) {
    const ctx = this.context;
    const y = ground - unit * (sprite.z ?? .2);
    const radius = Math.max(2, unit * (sprite.kind === "shell" ? .07 : .1));
    ctx.fillStyle = sprite.kind === "shell" ? "#ffd36c" : "#3d5440";
    ctx.shadowColor = sprite.kind === "shell" ? "#ffb62f" : "transparent"; ctx.shadowBlur = radius * 4;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }

  drawExplosion({ sprite, x, ground, unit }) {
    const ctx = this.context;
    const progress = 1 - sprite.life / sprite.maxLife;
    const radius = unit * sprite.radius * (.2 + progress * .82);
    const gradient = ctx.createRadialGradient(x, ground - unit * .25, 0, x, ground - unit * .25, radius);
    gradient.addColorStop(0, `rgba(255,255,225,${1-progress})`); gradient.addColorStop(.18, `rgba(255,184,52,${.95-progress*.6})`); gradient.addColorStop(.55, `rgba(224,54,21,${.65-progress*.5})`); gradient.addColorStop(1, "rgba(30,30,30,0)");
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, ground - unit * .25, radius, 0, Math.PI * 2); ctx.fill();
  }

  drawWeapon(game) {
    const ctx = this.context, width = this.width, height = this.height;
    if (!game.player.alive) return;
    if (game.tank.occupied) { this.drawTankCockpit(game); return; }
    const bob = Math.sin(performance.now() * .007) * height * .003;
    if (game.player.weapon === WEAPON.SNIPER) {
      ctx.save(); ctx.translate(width * .72, height * (.88 + bob / height)); ctx.rotate(-.12);
      ctx.fillStyle = "#151d1e"; ctx.beginPath(); ctx.moveTo(0,0);ctx.lineTo(width*.28,-height*.12);ctx.lineTo(width*.32,-height*.08);ctx.lineTo(width*.08,height*.08);ctx.closePath();ctx.fill();
      ctx.fillStyle="#334344";ctx.fillRect(width*.05,-height*.04,width*.24,height*.025);ctx.fillStyle="#0b1011";ctx.fillRect(width*.12,-height*.075,width*.11,height*.035);ctx.beginPath();ctx.arc(width*.155,-height*.058,height*.025,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#263538";ctx.fillRect(width*.02,height*.02,width*.08,height*.12);ctx.fillStyle="#080d0e";ctx.fillRect(width*.275,-height*.05,width*.12,height*.012);
      if (game.shake > .28) { ctx.fillStyle="rgba(255,204,78,.75)";ctx.beginPath();ctx.moveTo(width*.395,-height*.07);ctx.lineTo(width*.45,-height*.04);ctx.lineTo(width*.397,-height*.015);ctx.closePath();ctx.fill(); }
      ctx.restore();
    } else if (game.player.weapon === WEAPON.KNIFE) {
      ctx.save();ctx.translate(width*.72,height*.88+bob);ctx.rotate(-.3);ctx.fillStyle="#151e20";ctx.fillRect(0,0,width*.1,height*.06);ctx.fillStyle="#b7ced1";ctx.beginPath();ctx.moveTo(width*.09,0);ctx.lineTo(width*.3,-height*.15);ctx.lineTo(width*.18,height*.02);ctx.lineTo(width*.09,height*.04);ctx.closePath();ctx.fill();ctx.strokeStyle="#eaffff";ctx.stroke();ctx.restore();
    } else {
      ctx.save();ctx.translate(width*.75,height*.9+bob);ctx.fillStyle="#283b2e";ctx.beginPath();ctx.arc(0,0,height*.075,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#82917b";ctx.lineWidth=4;ctx.stroke();ctx.fillStyle="#aab5a8";ctx.fillRect(-height*.015,-height*.1,height*.03,height*.04);ctx.restore();
    }
  }

  drawTankCockpit(game) {
    const ctx = this.context, width = this.width, height = this.height;
    ctx.fillStyle = "#111c19";ctx.beginPath();ctx.moveTo(0,height);ctx.lineTo(0,height*.86);ctx.lineTo(width*.22,height*.78);ctx.lineTo(width*.78,height*.78);ctx.lineTo(width,height*.86);ctx.lineTo(width,height);ctx.closePath();ctx.fill();
    ctx.fillStyle="#283c34";ctx.fillRect(width*.3,height*.82,width*.4,height*.18);ctx.fillStyle="#0a1110";ctx.fillRect(width*.43,height*.84,width*.14,height*.09);
    ctx.strokeStyle="rgba(104,232,239,.45)";ctx.lineWidth=2;ctx.beginPath();ctx.arc(width*.5,height*.885,height*.045,Math.PI,Math.PI*2);ctx.stroke();
    if (game.shake > .6) { const glow=ctx.createRadialGradient(width*.5,height*.51,0,width*.5,height*.51,width*.18);glow.addColorStop(0,"rgba(255,236,161,.78)");glow.addColorStop(1,"rgba(255,130,20,0)");ctx.fillStyle=glow;ctx.fillRect(width*.3,height*.3,width*.4,height*.4); }
  }

  drawRadar(game) {
    const ctx = this.radarContext, width = this.radar.width, height = this.radar.height;
    const scaleX = width / MAP_WIDTH, scaleY = height / MAP_HEIGHT;
    ctx.fillStyle="#071216";ctx.fillRect(0,0,width,height);
    for (let y=0;y<MAP_HEIGHT;y+=1) for(let x=0;x<MAP_WIDTH;x+=1) {
      const tile=TILE_MAP[y][x]; if(tile===".") continue;
      ctx.fillStyle=tile==="G"?"rgba(91,220,226,.24)":tile==="C"?"rgba(211,179,115,.28)":"rgba(166,190,190,.14)";
      ctx.fillRect(x*scaleX,y*scaleY,Math.ceil(scaleX),Math.ceil(scaleY));
    }
    ctx.strokeStyle="rgba(104,232,239,.08)";ctx.lineWidth=1;for(let x=0;x<width;x+=width/6){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke()}for(let y=0;y<height;y+=height/5){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke()}
    for (const actor of game.actors) {
      if (!actor.alive) continue;
      ctx.fillStyle=COLORS[actor.team];ctx.beginPath();ctx.arc(actor.x*scaleX,actor.y*scaleY,actor.isPlayer?4:2.7,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle="#e9be59";ctx.fillRect(game.tank.x*scaleX-3,game.tank.y*scaleY-3,6,6);
    const px=game.player.x*scaleX,py=game.player.y*scaleY;ctx.strokeStyle="rgba(104,232,239,.35)";ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+Math.cos(game.player.angle-.55)*25,py+Math.sin(game.player.angle-.55)*25);ctx.moveTo(px,py);ctx.lineTo(px+Math.cos(game.player.angle+.55)*25,py+Math.sin(game.player.angle+.55)*25);ctx.stroke();
  }
}
