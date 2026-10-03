import { FOV, MAPS, SCOPED_FOV, TEAM, THROWABLES, clamp, normalizeAngle, tileAt } from "./config.js?v=20261003-v2";

const TEAM_COLORS = {
  seal: { main: "#2ca9df", shade: "#155d91", light: "#75dcff", gear: "#17394f" },
  terror: { main: "#ef654d", shade: "#8f2f38", light: "#ffad62", gear: "#51322d" },
};

const MAP_BACKGROUNDS = Object.freeze({
  city: new URL("../assets/toon-city.png", import.meta.url).href,
  wild: new URL("../assets/toon-wild.png", import.meta.url).href,
});

function roundedPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const hash = (x, y) => {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

export class Renderer {
  constructor(canvas, radar) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false });
    this.radar = radar;
    this.radarContext = radar.getContext("2d");
    this.width = 0;
    this.height = 0;
    this.depth = new Float32Array(1);
    this.backdropCache = new Map();
    this.backgrounds = {};
    Object.values(MAPS).forEach(map => {
      const image = new Image();
      image.decoding = "async";
      image.src = MAP_BACKGROUNDS[map.id];
      this.backgrounds[map.id] = image;
    });
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const density = Math.min(devicePixelRatio || 1, innerWidth < 900 ? 1.05 : 1.25);
    const ratio = density * (innerWidth > 1000 ? .7 : .88);
    const width = Math.round(innerWidth * ratio);
    const height = Math.round(innerHeight * ratio);
    if (width === this.width && height === this.height) return;
    this.canvas.width = this.width = width;
    this.canvas.height = this.height = height;
    this.depth = new Float32Array(width);
    this.backdropCache.clear();
  }

  render(game) {
    if (!game.player || !game.map) return;
    const ctx = this.context;
    const fov = game.player.scoped ? SCOPED_FOV : FOV;
    const focal = this.width / (2 * Math.tan(fov / 2));
    const horizon = this.height * .45;
    const shake = game.shake > 0 ? game.shake * 5 : 0;
    ctx.save();
    ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    this.drawBackdrop(game, horizon);
    this.drawGround(game, fov, focal, horizon);
    this.drawWalls(game, fov, focal, horizon);
    this.drawWorldSprites(game, focal, horizon, fov);
    this.drawAtmosphere(game, horizon);
    this.drawWeapon(game);
    if (game.flash > 0) {
      ctx.fillStyle = `rgba(255,74,76,${game.flash * .42})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    ctx.restore();
    this.drawRadar(game);
  }

  drawBackdrop(game, horizon) {
    const ctx = this.context;
    const image = this.backgrounds[game.map.id];
    if (image && image.complete && image.naturalWidth) {
      const panoramaWidth = this.width * 2.05;
      const normalized = ((game.player.angle / (Math.PI * 2)) % 1 + 1) % 1;
      const offset = -normalized * panoramaWidth;
      const backdrop = this.getBackdrop(game.map.id, image, panoramaWidth, horizon * 1.7);
      ctx.drawImage(backdrop, offset, 0);
      ctx.drawImage(backdrop, offset + panoramaWidth, 0);
      const wash = ctx.createLinearGradient(0, 0, 0, horizon);
      wash.addColorStop(0, "rgba(44,176,239,.02)");
      wash.addColorStop(1, game.map.theme === "city" ? "rgba(18,64,94,.32)" : "rgba(28,89,57,.28)");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, this.width, horizon);
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, "#25b8f3");
      sky.addColorStop(1, "#c9f1ff");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, this.width, horizon);
    }
  }

  getBackdrop(mapId, image, width, height) {
    const key = `${mapId}:${Math.round(width)}:${Math.round(height)}`;
    if (this.backdropCache.has(key)) return this.backdropCache.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    this.backdropCache.set(key, canvas);
    return canvas;
  }

  drawGround(game, fov, focal, horizon) {
    const ctx = this.context;
    const block = this.width > 900 ? 11 : 8;
    const leftAngle = game.player.angle - fov / 2;
    const rightAngle = game.player.angle + fov / 2;
    for (let screenY = Math.floor(horizon); screenY < this.height; screenY += block) {
      const rowDistance = Math.min(42, focal * .5 / Math.max(1, screenY - horizon));
      const leftX = game.player.x + Math.cos(leftAngle) * rowDistance;
      const leftY = game.player.y + Math.sin(leftAngle) * rowDistance;
      const rightX = game.player.x + Math.cos(rightAngle) * rowDistance;
      const rightY = game.player.y + Math.sin(rightAngle) * rowDistance;
      for (let screenX = 0; screenX < this.width; screenX += block) {
        const ratio = screenX / this.width;
        const worldX = leftX + (rightX - leftX) * ratio;
        const worldY = leftY + (rightY - leftY) * ratio;
        const noise = hash(Math.floor(worldX * 2), Math.floor(worldY * 2));
        if (game.map.theme === "city") {
          const stripe = Math.abs((worldX % 7 + 7) % 7 - 3.5) < .07;
          const base = 76 + Math.floor(noise * 12);
          ctx.fillStyle = stripe ? "#f5d96f" : `rgb(${base},${base + 9},${base + 16})`;
        } else {
          const dirt = hash(Math.floor(worldX * .5), Math.floor(worldY * .5)) > .69;
          const base = 84 + Math.floor(noise * 18);
          ctx.fillStyle = dirt ? `rgb(${base + 38},${base + 18},${base - 18})` : `rgb(${base - 26},${base + 38},${base - 28})`;
        }
        ctx.fillRect(screenX, screenY, block + 1, block + 1);
      }
    }
    const shade = ctx.createLinearGradient(0, horizon, 0, this.height);
    shade.addColorStop(0, "rgba(22,56,68,.32)");
    shade.addColorStop(.7, "rgba(9,24,31,.04)");
    shade.addColorStop(1, "rgba(8,18,23,.26)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, horizon, this.width, this.height - horizon);
  }

  drawWalls(game, fov, focal, horizon) {
    const ctx = this.context;
    const columnWidth = this.width > 900 ? 5 : 4;
    for (let screenX = 0; screenX < this.width; screenX += columnWidth) {
      const cameraX = screenX / this.width * 2 - 1;
      const rayAngle = game.player.angle + Math.atan(cameraX * Math.tan(fov / 2));
      const hit = this.castRay(game.map, game.player.x, game.player.y, rayAngle);
      const corrected = Math.max(.001, hit.distance * Math.cos(rayAngle - game.player.angle));
      const baseHeight = focal / corrected;
      const scales = game.map.theme === "city" ? { B: 2.05, C: .55 } : { O: 1.18, R: .82, T: 1.85 };
      const wallHeight = Math.min(this.height * 2.7, baseHeight * (scales[hit.tile] == null ? 1 : scales[hit.tile]));
      const bottom = horizon + baseHeight * .5;
      const top = bottom - wallHeight;
      const shade = clamp(1 - corrected / 38, .2, 1) * (hit.side ? .76 : 1);
      ctx.fillStyle = this.wallColor(game.map.theme, hit.tile, shade, hit.wallX);
      ctx.fillRect(screenX, top, columnWidth + 1, wallHeight);
      this.drawWallDetail(game.map.theme, hit, screenX, top, wallHeight, columnWidth, shade);
      for (let offset = 0; offset < columnWidth && screenX + offset < this.width; offset += 1) this.depth[screenX + offset] = corrected;
    }
  }

  wallColor(theme, tile, shade, wallX) {
    const band = Math.floor(wallX * 8) % 2 ? 1 : .92;
    if (theme === "city") {
      if (tile === "C") return `rgb(${Math.floor(246 * shade)},${Math.floor(148 * shade)},${Math.floor(76 * shade)})`;
      if (tile === "B") return `rgb(${Math.floor(83 * shade * band)},${Math.floor(154 * shade * band)},${Math.floor(196 * shade * band)})`;
      return `rgb(${Math.floor(72 * shade)},${Math.floor(105 * shade)},${Math.floor(124 * shade)})`;
    }
    if (tile === "T") return `rgb(${Math.floor(53 * shade)},${Math.floor(137 * shade)},${Math.floor(66 * shade)})`;
    if (tile === "O") return `rgb(${Math.floor(210 * shade)},${Math.floor(133 * shade)},${Math.floor(57 * shade)})`;
    return `rgb(${Math.floor(137 * shade * band)},${Math.floor(148 * shade * band)},${Math.floor(159 * shade * band)})`;
  }

  drawWallDetail(theme, hit, x, top, height, width, shade) {
    const ctx = this.context;
    if (height < 8) return;
    if (theme === "city" && hit.tile === "B") {
      if (Math.floor(hit.wallX * 12) % 3 !== 0) {
        ctx.fillStyle = `rgba(255,228,111,${.15 + shade * .28})`;
        for (let row = 0; row < 5; row += 1) ctx.fillRect(x, top + height * (.12 + row * .18), width + 1, Math.max(1, height * .055));
      }
    } else if (hit.tile === "C") {
      ctx.fillStyle = `rgba(255,245,201,${shade * .48})`;
      if (Math.floor(hit.wallX * 10) % 4 === 0) ctx.fillRect(x, top + height * .2, width + 1, height * .18);
    } else if (hit.tile === "T") {
      ctx.fillStyle = `rgba(157,224,91,${shade * .34})`;
      if (Math.floor(hit.wallX * 12) % 3 === 0) ctx.fillRect(x, top, width + 1, height * .58);
    } else {
      ctx.fillStyle = `rgba(255,255,255,${shade * .11})`;
      if (Math.floor(hit.wallX * 16) % 5 === 0) ctx.fillRect(x, top, 1, height);
    }
    if (Math.floor(hit.wallX * 30) === 0) {
      ctx.fillStyle = "rgba(22,37,48,.5)";
      ctx.fillRect(x, top, Math.max(1, width * .45), height);
    }
  }

  castRay(map, x, y, angle) {
    const rayX = Math.cos(angle);
    const rayY = Math.sin(angle);
    let mapX = Math.floor(x);
    let mapY = Math.floor(y);
    let side = 0;
    let tile = "#";
    const deltaX = rayX === 0 ? 1e30 : Math.abs(1 / rayX);
    const deltaY = rayY === 0 ? 1e30 : Math.abs(1 / rayY);
    const stepX = rayX < 0 ? -1 : 1;
    const stepY = rayY < 0 ? -1 : 1;
    let sideX = rayX < 0 ? (x - mapX) * deltaX : (mapX + 1 - x) * deltaX;
    let sideY = rayY < 0 ? (y - mapY) * deltaY : (mapY + 1 - y) * deltaY;
    for (let step = 0; step < 96; step += 1) {
      if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
      else { sideY += deltaY; mapY += stepY; side = 1; }
      tile = tileAt(map, mapX, mapY);
      if (tile !== ".") break;
    }
    const rayDistance = side ? sideY - deltaY : sideX - deltaX;
    const exact = side ? x + rayDistance * rayX : y + rayDistance * rayY;
    return { distance: rayDistance, tile, side, wallX: exact - Math.floor(exact), mapX, mapY };
  }

  drawWorldSprites(game, focal, horizon, fov) {
    const ownDriving = game.tank.driverId === game.player.id;
    const sprites = [
      ...game.actors.filter(actor => actor.alive && !actor.isPlayer && actor.id !== game.tank.driverId).map(actor => ({ ...actor, kind: "actor" })),
      ...game.projectiles.map(projectile => ({ ...projectile, kind: projectile.type })),
      ...game.effects.map(effect => ({ ...effect, kind: "effect" })),
    ];
    if (!ownDriving) sprites.push({ ...game.tank, kind: "tank" });
    const projected = sprites
      .map(sprite => ({ sprite, ...this.project(sprite, game.player, focal, horizon) }))
      .filter(item => item.forward > .15 && Math.abs(item.delta) < fov * .92)
      .sort((a, b) => b.forward - a.forward);
    for (const item of projected) {
      const center = Math.floor(item.x);
      if (center < 0 || center >= this.width) continue;
      if (item.sprite.type !== "smoke" && this.depth[center] + .28 < item.forward) continue;
      this.context.save();
      if (item.sprite.kind === "actor") this.drawActor(item);
      if (item.sprite.kind === "tank") this.drawTank(item);
      if (item.sprite.kind === "grenade" || item.sprite.kind === "shell") this.drawProjectile(item);
      if (item.sprite.kind === "effect") this.drawEffect(item);
      this.context.restore();
    }
  }

  project(sprite, player, focal, horizon) {
    const dx = sprite.x - player.x;
    const dy = sprite.y - player.y;
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
    const colors = TEAM_COLORS[sprite.team] || TEAM_COLORS.terror;
    const scale = unit * .98;
    const bob = Math.sin(performance.now() * .005 + sprite.index * 1.7) * scale * .012;
    const fog = clamp(1.15 - forward / 38, .28, 1);
    ctx.globalAlpha = fog;
    ctx.fillStyle = "rgba(22,31,42,.38)";
    ctx.beginPath();
    ctx.ellipse(x, ground, scale * .28, Math.max(2, scale * .045), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, ground + bob);
    ctx.scale(scale, scale);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = .035;
    ctx.strokeStyle = "#172536";

    this.fillStrokeCapsule(ctx, -.19, -.39, .14, .42, .055, colors.shade);
    this.fillStrokeCapsule(ctx, .05, -.39, .14, .42, .055, colors.main);
    this.fillStrokeCapsule(ctx, -.23, -.08, .22, .1, .04, "#263a45");
    this.fillStrokeCapsule(ctx, .02, -.08, .22, .1, .04, "#263a45");

    roundedPath(ctx, -.3, -.82, .6, .48, .14);
    ctx.fillStyle = colors.main;
    ctx.fill();
    ctx.stroke();
    roundedPath(ctx, -.25, -.74, .5, .31, .08);
    ctx.fillStyle = colors.gear;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.light;
    ctx.fillRect(-.19, -.7, .38, .055);
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fillRect(-.2, -.59, .1, .11);
    ctx.fillRect(.1, -.59, .1, .11);

    this.fillStrokeCapsule(ctx, -.42, -.72, .18, .4, .08, colors.shade, -.22);
    this.fillStrokeCapsule(ctx, .24, -.72, .18, .4, .08, colors.main, .18);
    ctx.fillStyle = "#243644";
    ctx.beginPath();
    ctx.arc(-.34, -.36, .085, 0, Math.PI * 2);
    ctx.arc(.34, -.36, .085, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#f4b27b";
    ctx.beginPath();
    ctx.ellipse(0, -.98, .19, .2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.gear;
    ctx.beginPath();
    ctx.arc(0, -1.03, .225, Math.PI, Math.PI * 2);
    ctx.lineTo(.2, -.95);
    ctx.quadraticCurveTo(0, -.87, -.2, -.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#bdefff";
    roundedPath(ctx, -.15, -1.02, .3, .085, .04);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.main;
    roundedPath(ctx, -.16, -.955, .32, .105, .04);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.translate(-.1, -.52);
    ctx.rotate(-.38);
    roundedPath(ctx, -.29, -.055, .63, .11, .045);
    ctx.fillStyle = "#2e3c42";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#111d24";
    ctx.fillRect(.22, -.028, .27, .056);
    roundedPath(ctx, -.08, .035, .14, .16, .025);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    ctx.globalAlpha = fog;
    ctx.fillStyle = colors.light;
    ctx.beginPath();
    ctx.arc(x - scale * .31, ground - scale * .66, Math.max(1.5, scale * .025), 0, Math.PI * 2);
    ctx.fill();
    if (forward < 16) {
      const barWidth = Math.max(25, scale * .63);
      const barY = ground - scale * 1.25;
      ctx.fillStyle = "rgba(19,31,42,.76)";
      roundedPath(ctx, x - barWidth / 2, barY, barWidth, Math.max(3, scale * .025), 2);
      ctx.fill();
      ctx.fillStyle = colors.light;
      ctx.fillRect(x - barWidth / 2, barY, barWidth * clamp(sprite.health / 100, 0, 1), Math.max(3, scale * .025));
      ctx.fillStyle = "white";
      ctx.font = `800 ${Math.max(9, scale * .09)}px system-ui`;
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(23,37,54,.8)";
      ctx.strokeText(sprite.name, x, barY - Math.max(4, scale * .035));
      ctx.fillText(sprite.name, x, barY - Math.max(4, scale * .035));
    }
  }

  fillStrokeCapsule(ctx, x, y, width, height, radius, fill, rotation = 0) {
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate(rotation);
    roundedPath(ctx, -width / 2, -height / 2, width, height, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawTank({ sprite, x, ground, unit, forward }) {
    const ctx = this.context;
    const width = unit * 1.9;
    const height = unit * .87;
    const top = ground - height;
    ctx.globalAlpha = clamp(1.15 - forward / 38, .3, 1);
    ctx.fillStyle = "rgba(19,31,42,.38)";
    ctx.beginPath();
    ctx.ellipse(x, ground, width * .55, height * .13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, unit * .045);
    ctx.strokeStyle = "#17304a";
    roundedPath(ctx, x - width * .51, top + height * .42, width * 1.02, height * .55, height * .18);
    ctx.fillStyle = "#52b65a";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#294f46";
    roundedPath(ctx, x - width * .47, top + height * .65, width * .94, height * .24, height * .1);
    ctx.fill();
    ctx.stroke();
    for (let index = -3; index <= 3; index += 1) {
      ctx.fillStyle = index % 2 ? "#88d35f" : "#e8d45b";
      ctx.beginPath();
      ctx.arc(x + index * width * .12, top + height * .77, height * .105, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    roundedPath(ctx, x - width * .24, top + height * .2, width * .48, height * .34, height * .15);
    ctx.fillStyle = "#7ad166";
    ctx.fill();
    ctx.stroke();
    const barrelAngle = normalizeAngle(sprite.turretAngle - sprite.angle);
    const barrelX = Math.sin(barrelAngle) * width * .27;
    ctx.strokeStyle = "#25444a";
    ctx.lineWidth = Math.max(4, unit * .12);
    ctx.beginPath();
    ctx.moveTo(x, top + height * .29);
    ctx.lineTo(x + barrelX, top - height * .25);
    ctx.stroke();
    ctx.fillStyle = "#d7e85e";
    ctx.beginPath();
    ctx.arc(x - width * .13, top + height * .35, height * .055, 0, Math.PI * 2);
    ctx.arc(x + width * .13, top + height * .35, height * .055, 0, Math.PI * 2);
    ctx.fill();
    if (forward < 10) {
      ctx.fillStyle = "#ecffb2";
      ctx.font = `900 ${Math.max(8, unit * .12)}px system-ui`;
      ctx.textAlign = "center";
      ctx.strokeStyle = "#17304a";
      ctx.lineWidth = 3;
      ctx.strokeText("M-77", x, top - height * .14);
      ctx.fillText("M-77", x, top - height * .14);
    }
  }

  drawProjectile({ sprite, x, ground, unit }) {
    const ctx = this.context;
    const z = sprite.z == null ? .2 : sprite.z;
    const y = ground - unit * z;
    const throwable = THROWABLES[sprite.throwableId];
    const color = sprite.kind === "shell" ? "#fff36b" : throwable?.color || "#ff994c";
    const radius = Math.max(3, unit * (sprite.kind === "shell" ? .075 : .11));
    ctx.fillStyle = color;
    ctx.strokeStyle = "#273548";
    ctx.lineWidth = Math.max(2, radius * .22);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  drawEffect({ sprite, x, ground, unit }) {
    const ctx = this.context;
    const progress = 1 - sprite.life / sprite.maxLife;
    if (sprite.type === "smoke") {
      ctx.globalAlpha = clamp(sprite.life < 1 ? sprite.life : progress < .18 ? progress / .18 : 1, 0, .78);
      for (let index = 0; index < 10; index += 1) {
        const ox = Math.sin(index * 14.7) * unit * sprite.radius * .3;
        const oy = Math.cos(index * 9.1) * unit * sprite.radius * .17 - unit * .45;
        const radius = unit * sprite.radius * (.17 + (index % 3) * .045);
        ctx.fillStyle = index % 2 ? "#dce9e7" : "#a9c4c0";
        ctx.strokeStyle = "rgba(42,69,76,.45)";
        ctx.lineWidth = Math.max(1, unit * .02);
        ctx.beginPath();
        ctx.arc(x + ox, ground + oy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      return;
    }
    const radius = unit * sprite.radius * (.22 + progress * .72);
    const colors = sprite.type === "skull" ? ["#d39aff", "#7c46d8"] : sprite.type === "firework" ? ["#fff36b", "#ff6755"] : ["#fff7a2", "#ff7042"];
    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = colors[0];
    ctx.strokeStyle = "#5a2c37";
    ctx.lineWidth = Math.max(2, unit * .04);
    ctx.beginPath();
    const points = 12;
    for (let index = 0; index < points * 2; index += 1) {
      const angle = index / (points * 2) * Math.PI * 2 - Math.PI / 2;
      const length = index % 2 ? radius * .48 : radius;
      const px = x + Math.cos(angle) * length;
      const py = ground - unit * .28 + Math.sin(angle) * length;
      if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors[1];
    ctx.beginPath();
    ctx.arc(x, ground - unit * .28, radius * .36, 0, Math.PI * 2);
    ctx.fill();
  }

  drawAtmosphere(game, horizon) {
    const ctx = this.context;
    ctx.fillStyle = game.map.theme === "city" ? "rgba(60,194,255,.035)" : "rgba(125,239,121,.035)";
    ctx.fillRect(0, horizon * .76, this.width, this.height - horizon * .76);
  }

  drawWeapon(game) {
    if (!game.player.alive) return;
    if (game.tank.driverId === game.player.id) { this.drawTankCockpit(game); return; }
    const ctx = this.context;
    const width = this.width;
    const height = this.height;
    const visual = game.currentWeapon?.visual || "rifle";
    const bob = Math.sin(performance.now() * .007) * height * .004;
    ctx.save();
    ctx.translate(0, bob);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#14283b";
    ctx.lineWidth = Math.max(4, height * .008);
    if (visual === "knife" || visual === "axe") {
      ctx.fillStyle = "#ffcc8a";
      roundedPath(ctx, width * .72, height * .78, width * .24, height * .24, height * .06);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = visual === "axe" ? "#78d4dd" : "#dcecf2";
      ctx.beginPath();
      if (visual === "axe") {
        ctx.moveTo(width * .73, height * .67); ctx.lineTo(width * .84, height * .49); ctx.lineTo(width * .92, height * .57); ctx.lineTo(width * .82, height * .71);
      } else {
        ctx.moveTo(width * .71, height * .7); ctx.lineTo(width * .91, height * .48); ctx.lineTo(width * .82, height * .75);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      const gunColor = visual === "sniper" ? "#334a55" : visual === "machinegun" ? "#287a87" : visual === "pistol" || visual === "dual" ? "#d8e6e9" : "#8b5136";
      ctx.fillStyle = "#ffbd7f";
      ctx.beginPath(); ctx.ellipse(width * .64, height * .88, width * .1, height * .12, -.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = gunColor;
      ctx.beginPath();
      ctx.moveTo(width * .44, height * .99);
      ctx.lineTo(width * .55, height * .69);
      ctx.lineTo(width * .9, height * .57);
      ctx.lineTo(width * .94, height * .64);
      ctx.lineTo(width * .66, height * .78);
      ctx.lineTo(width * .76, height * .99);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#182d3a";
      roundedPath(ctx, width * .68, height * .61, width * .14, height * .07, height * .025); ctx.fill(); ctx.stroke();
      if (visual === "sniper") {
        ctx.fillStyle = "#59c5d1";
        roundedPath(ctx, width * .7, height * .55, width * .18, height * .055, height * .02); ctx.fill(); ctx.stroke();
      }
      if (visual === "dual") {
        ctx.save(); ctx.translate(-width * .28, height * .03); ctx.fillStyle = gunColor;
        roundedPath(ctx, width * .64, height * .7, width * .24, height * .08, height * .025); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
  }

  drawTankCockpit(game) {
    const ctx = this.context;
    const width = this.width;
    const height = this.height;
    ctx.fillStyle = "#294e49";
    ctx.strokeStyle = "#142d39";
    ctx.lineWidth = Math.max(5, height * .01);
    ctx.beginPath();
    ctx.moveTo(0, height); ctx.lineTo(width * .14, height * .72); ctx.lineTo(width * .4, height * .64); ctx.lineTo(width * .6, height * .64); ctx.lineTo(width * .86, height * .72); ctx.lineTo(width, height); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#7bd266";
    roundedPath(ctx, width * .39, height * .69, width * .22, height * .18, height * .04); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#d7e85e";
    ctx.font = `900 ${height * .04}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(Math.round(Math.abs(game.tank.speed) * 31).toString().padStart(3, "0"), width * .5, height * .79);
  }

  drawRadar(game) {
    const ctx = this.radarContext;
    const width = this.radar.width;
    const height = this.radar.height;
    const mapWidth = game.map.grid[0].length;
    const mapHeight = game.map.grid.length;
    const scale = Math.min(width / mapWidth, height / mapHeight);
    const offsetX = (width - mapWidth * scale) / 2;
    const offsetY = (height - mapHeight * scale) / 2;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#122d3a";
    ctx.fillRect(0, 0, width, height);
    for (let y = 0; y < mapHeight; y += 1) {
      for (let x = 0; x < mapWidth; x += 1) {
        const tile = game.map.grid[y][x];
        if (tile === ".") continue;
        ctx.fillStyle = game.map.theme === "city" ? (tile === "C" ? "#de9a4d" : "#315b72") : (tile === "T" ? "#3c7844" : tile === "O" ? "#ad733b" : "#64717b");
        ctx.fillRect(offsetX + x * scale, offsetY + y * scale, scale + .5, scale + .5);
      }
    }
    for (const actor of game.actors) {
      if (!actor.alive) continue;
      ctx.fillStyle = actor.team === TEAM.SEAL ? "#6ce9ff" : "#ff735f";
      ctx.beginPath();
      ctx.arc(offsetX + actor.x * scale, offsetY + actor.y * scale, actor.isPlayer ? 3.6 : 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffdf5f";
    ctx.fillRect(offsetX + game.tank.x * scale - 2.5, offsetY + game.tank.y * scale - 2.5, 5, 5);
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.strokeRect(offsetX, offsetY, mapWidth * scale, mapHeight * scale);
  }
}
