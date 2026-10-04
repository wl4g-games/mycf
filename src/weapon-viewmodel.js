const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const VIEWMODELS = Object.freeze({
  barrett: {
    kind: "rifle", body: "#334d59", accent: "#64cfdb", stock: "#263842",
    length: .72, receiver: .35, barrel: .42, scope: true, magazine: false,
    originX: .9, originY: .98, angle: .72, kick: 1,
  },
  ak47: {
    kind: "rifle", body: "#78482f", accent: "#d78b46", stock: "#56301f",
    length: .59, receiver: .32, barrel: .3, scope: false, magazine: true,
    originX: .9, originY: .99, angle: .76, kick: .72,
  },
  policeMG: {
    kind: "rifle", body: "#267b88", accent: "#72dce1", stock: "#205561",
    length: .62, receiver: .37, barrel: .3, scope: true, magazine: true,
    originX: .9, originY: .99, angle: .74, kick: .58,
  },
  powerBow: {
    kind: "bow", body: "#5f3b28", accent: "#6ce3da", stock: "#293b42",
    length: .64, originX: .9, originY: 1, angle: .76, kick: .42,
  },
  whitePistol: {
    kind: "pistol", body: "#dce9ea", accent: "#7bcbd3", stock: "#63757c",
    length: .34, originX: .85, originY: .99, angle: .88, kick: .68,
  },
  baike: {
    kind: "pistol", body: "#edf2ef", accent: "#df8d4c", stock: "#5a6468",
    length: .35, originX: .85, originY: .99, angle: .86, kick: .76,
  },
  desertEagle: {
    kind: "pistol", body: "#b99b68", accent: "#f4d89b", stock: "#3e342d",
    length: .41, originX: .86, originY: .995, angle: .84, kick: .94,
  },
  dualPistols: {
    kind: "dual", body: "#dce9ea", accent: "#62ced9", stock: "#53666d",
    length: .33, originX: .86, originY: 1, angle: .87, kick: .54,
  },
  swiss: { kind: "knife", originX: .82, originY: 1.01, angle: .62 },
  axe: { kind: "axe", originX: .84, originY: 1.02, angle: .58 },
  dualBlades: { kind: "dual-blades", originX: .84, originY: 1.02, angle: .61 },
});

const FALLBACK = VIEWMODELS.ak47;

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

function strokeLine(ctx, fromX, fromY, toX, toY, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
}

function drawHands(ctx, size, supportX = -.28) {
  const outline = "#153047";
  strokeLine(ctx, size * .18, size * .3, size * -.025, size * .105, size * .18, outline);
  strokeLine(ctx, size * .18, size * .3, size * -.025, size * .105, size * .135, "#2383a7");
  strokeLine(ctx, size * -.05, size * .31, size * supportX, size * .075, size * .17, outline);
  strokeLine(ctx, size * -.05, size * .31, size * supportX, size * .075, size * .125, "#2b91b2");
  ctx.fillStyle = "#ffc18b";
  ctx.strokeStyle = outline;
  ctx.lineWidth = size * .025;
  ctx.beginPath();
  ctx.ellipse(size * -.02, size * .105, size * .075, size * .065, -.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(size * supportX, size * .07, size * .075, size * .058, .1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawHandWrap(ctx, size, x, y, rotation = 0) {
  ctx.save();
  ctx.translate(size * x, size * y);
  ctx.rotate(rotation);
  ctx.fillStyle = "#ffc18b";
  ctx.strokeStyle = "#153047";
  ctx.lineWidth = size * .024;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * .07, size * .052, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(142,73,58,.52)";
  ctx.lineWidth = size * .009;
  for (const offset of [-.026, 0, .026]) {
    ctx.beginPath();
    ctx.moveTo(size * offset, size * -.03);
    ctx.lineTo(size * (offset + .008), size * .026);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMuzzleFlash(ctx, x, y, size, strength) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = clamp(strength * 1.45, 0, 1);
  ctx.globalCompositeOperation = "screen";
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.45);
  glow.addColorStop(0, "rgba(255,255,226,1)");
  glow.addColorStop(.32, "rgba(255,222,73,.96)");
  glow.addColorStop(1, "rgba(255,96,39,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff7b5";
  ctx.strokeStyle = "#ff7a2e";
  ctx.lineWidth = Math.max(2, size * .09);
  ctx.beginPath();
  for (let point = 0; point < 16; point += 1) {
    const angle = point / 16 * Math.PI * 2;
    const radius = point % 2 ? size * .35 : size * (point % 4 ? .75 : 1.18);
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (point === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawRifle(ctx, size, profile, muzzle) {
  const outline = "#132b3a";
  const receiverStart = -profile.receiver * size;
  const muzzleX = -profile.length * size;
  drawHands(ctx, size, -.3);

  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(3, size * .025);
  ctx.lineJoin = "round";
  ctx.fillStyle = profile.stock;
  ctx.beginPath();
  ctx.moveTo(size * -.015, size * -.035);
  ctx.lineTo(size * .2, size * .035);
  ctx.lineTo(size * .18, size * .14);
  ctx.lineTo(size * -.03, size * .085);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#1a303c";
  ctx.beginPath();
  ctx.moveTo(receiverStart + size * .035, size * -.052);
  ctx.lineTo(muzzleX, size * -.021);
  ctx.lineTo(muzzleX, size * .021);
  ctx.lineTo(receiverStart + size * .035, size * .052);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(189,235,238,.62)";
  ctx.lineWidth = Math.max(1.5, size * .012);
  ctx.beginPath();
  ctx.moveTo(receiverStart + size * .03, size * -.033);
  ctx.lineTo(muzzleX + size * .015, size * -.012);
  ctx.stroke();
  ctx.fillStyle = profile.accent;
  ctx.beginPath();
  ctx.ellipse(muzzleX - size * .012, 0, size * .026, size * .052, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#102733";
  ctx.beginPath();
  ctx.ellipse(muzzleX - size * .015, 0, size * .011, size * .025, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.58)";
  ctx.lineWidth = Math.max(1, size * .008);
  ctx.stroke();

  ctx.fillStyle = profile.body;
  ctx.beginPath();
  ctx.moveTo(receiverStart, size * -.07);
  ctx.lineTo(size * .015, size * -.105);
  ctx.lineTo(size * .035, size * .105);
  ctx.lineTo(receiverStart, size * .07);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = profile.accent;
  ctx.beginPath();
  ctx.moveTo(receiverStart + size * .045, size * -.054);
  ctx.lineTo(size * -.035, size * -.072);
  ctx.lineTo(size * -.02, size * -.026);
  ctx.lineTo(receiverStart + size * .045, size * -.018);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#203641";
  roundedPath(ctx, size * -.08, size * .055, size * .105, size * .19, size * .025);
  ctx.fill();
  ctx.stroke();
  if (profile.magazine) {
    ctx.save();
    ctx.translate(size * -.2, size * .07);
    ctx.rotate(-.15);
    roundedPath(ctx, size * -.045, 0, size * .13, size * .21, size * .025);
    ctx.fillStyle = profile.stock;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (profile.scope) {
    ctx.fillStyle = "#17313c";
    roundedPath(ctx, receiverStart + size * .07, size * -.145, size * .23, size * .075, size * .025);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = profile.accent;
    ctx.beginPath();
    ctx.arc(receiverStart + size * .28, size * -.108, size * .044, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const lens = ctx.createRadialGradient(
      receiverStart + size * .282, size * -.112, 0,
      receiverStart + size * .282, size * -.112, size * .035,
    );
    lens.addColorStop(0, "rgba(210,253,255,.95)");
    lens.addColorStop(.38, "rgba(72,184,208,.85)");
    lens.addColorStop(1, "rgba(8,28,42,.95)");
    ctx.fillStyle = lens;
    ctx.beginPath();
    ctx.arc(receiverStart + size * .282, size * -.112, size * .031, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "#142934";
    ctx.beginPath();
    ctx.moveTo(muzzleX + size * .08, size * -.037);
    ctx.lineTo(muzzleX + size * .11, size * -.105);
    ctx.lineTo(muzzleX + size * .135, size * -.038);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  drawHandWrap(ctx, size, -.3, .075, .04);
  drawHandWrap(ctx, size, -.015, .12, -.2);
  if (muzzle > 0) drawMuzzleFlash(ctx, muzzleX - size * .03, 0, size * .105, muzzle);
}

function drawBow(ctx, size, profile, release) {
  const outline = "#132b3a";
  const tipX = -profile.length * size;
  drawHands(ctx, size, -.31);
  ctx.strokeStyle = outline;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(4, size * .035);
  ctx.beginPath();
  ctx.moveTo(size * -.31, size * -.31);
  ctx.quadraticCurveTo(tipX - size * .12, size * -.2, tipX, 0);
  ctx.quadraticCurveTo(tipX - size * .12, size * .2, size * -.31, size * .31);
  ctx.stroke();
  ctx.strokeStyle = profile.accent;
  ctx.lineWidth = Math.max(2, size * .018);
  ctx.stroke();
  const stringX = size * (-.03 + release * .08);
  ctx.strokeStyle = "rgba(230,250,248,.9)";
  ctx.lineWidth = Math.max(1.5, size * .009);
  ctx.beginPath();
  ctx.moveTo(size * -.31, size * -.31);
  ctx.lineTo(stringX, 0);
  ctx.lineTo(size * -.31, size * .31);
  ctx.stroke();
  strokeLine(ctx, size * .08, 0, tipX - size * .2, 0, size * .022, "#d8c38a");
  ctx.fillStyle = profile.accent;
  ctx.beginPath();
  ctx.moveTo(tipX - size * .24, 0);
  ctx.lineTo(tipX - size * .17, size * -.035);
  ctx.lineTo(tipX - size * .17, size * .035);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.stroke();
  ctx.fillStyle = profile.stock;
  roundedPath(ctx, size * -.36, size * -.075, size * .16, size * .15, size * .035);
  ctx.fill();
  ctx.stroke();
  drawHandWrap(ctx, size, -.27, .02, 0);
  drawHandWrap(ctx, size, -.015, .01, -.16);
}

function drawDualBlades(ctx, size, swing) {
  const drawBlade = (offsetX, offsetY, rotation, shade) => {
    ctx.save();
    ctx.translate(size * offsetX, size * offsetY);
    ctx.rotate(rotation - Math.sin(swing * Math.PI) * .58);
    strokeLine(ctx, size * .18, size * .29, 0, size * .08, size * .16, "#142d3d");
    strokeLine(ctx, size * .18, size * .29, 0, size * .08, size * .115, shade);
    ctx.fillStyle = "#f0fbfc";
    ctx.strokeStyle = "#142d3d";
    ctx.lineWidth = size * .024;
    ctx.beginPath();
    ctx.moveTo(size * -.02, size * .04);
    ctx.lineTo(size * -.58, size * -.045);
    ctx.lineTo(size * -.2, size * .13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    drawHandWrap(ctx, size, 0, .08, -.18);
    ctx.restore();
  };
  drawBlade(-.18, .1, .08, "#277f9f");
  drawBlade(.08, 0, -.05, "#3196b3");
}

function drawPistol(ctx, size, profile, muzzle, handOffset = 0) {
  const outline = "#132b3a";
  const muzzleX = -profile.length * size;
  ctx.save();
  ctx.translate(0, handOffset);
  strokeLine(ctx, size * .17, size * .29, size * -.015, size * .12, size * .17, outline);
  strokeLine(ctx, size * .17, size * .29, size * -.015, size * .12, size * .125, "#2383a7");
  ctx.fillStyle = "#ffc18b";
  ctx.strokeStyle = outline;
  ctx.lineWidth = size * .025;
  ctx.beginPath();
  ctx.ellipse(size * -.01, size * .105, size * .075, size * .067, -.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = profile.stock;
  roundedPath(ctx, size * -.06, size * .04, size * .12, size * .23, size * .025);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = profile.body;
  ctx.beginPath();
  ctx.moveTo(muzzleX, size * -.045);
  ctx.lineTo(size * .055, size * -.085);
  ctx.lineTo(size * .055, size * .085);
  ctx.lineTo(muzzleX, size * .045);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = profile.accent;
  ctx.beginPath();
  ctx.moveTo(muzzleX + size * .025, size * -.031);
  ctx.lineTo(size * .025, size * -.059);
  ctx.lineTo(size * .025, size * -.021);
  ctx.lineTo(muzzleX + size * .025, size * -.012);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#102733";
  ctx.beginPath();
  ctx.ellipse(muzzleX - size * .009, 0, size * .012, size * .03, 0, 0, Math.PI * 2);
  ctx.fill();
  drawHandWrap(ctx, size, -.005, .12, -.18);
  if (muzzle > 0) drawMuzzleFlash(ctx, muzzleX - size * .025, size * -.005, size * .085, muzzle);
  ctx.restore();
}

function drawMelee(ctx, size, kind, swing) {
  const outline = "#142d3d";
  ctx.rotate(-Math.sin(swing * Math.PI) * .72);
  strokeLine(ctx, size * .22, size * .31, size * -.04, size * .09, size * .18, outline);
  strokeLine(ctx, size * .22, size * .31, size * -.04, size * .09, size * .13, "#2383a7");
  ctx.fillStyle = "#ffc18b";
  ctx.strokeStyle = outline;
  ctx.lineWidth = size * .027;
  ctx.beginPath();
  ctx.ellipse(size * -.035, size * .08, size * .075, size * .065, -.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#34424a";
  roundedPath(ctx, size * -.12, size * .015, size * .25, size * .08, size * .025);
  ctx.fill();
  ctx.stroke();
  drawHandWrap(ctx, size, -.035, .075, -.18);
  ctx.fillStyle = kind === "axe" ? "#72d7df" : "#e5f2f4";
  ctx.beginPath();
  if (kind === "axe") {
    ctx.moveTo(size * -.12, size * .06);
    ctx.lineTo(size * -.42, size * -.1);
    ctx.lineTo(size * -.54, size * .045);
    ctx.lineTo(size * -.35, size * .16);
    ctx.closePath();
  } else {
    ctx.moveTo(size * -.1, size * .025);
    ctx.lineTo(size * -.54, size * -.045);
    ctx.lineTo(size * -.16, size * .14);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
}

export function advanceWeaponEffects(state, dt) {
  if (!(dt > 0)) return state;
  return {
    ...state,
    kick: Math.max(0, state.kick - dt * 11),
    muzzle: Math.max(0, state.muzzle - dt),
    melee: Math.max(0, state.melee - dt * 3.8),
    time: state.time + dt,
  };
}

export function getViewmodelPose(weaponId, width, height, motion = {}, state = {}) {
  const profile = VIEWMODELS[weaponId] || FALLBACK;
  const safeWidth = Math.max(0, Number(width) || 0);
  const safeHeight = Math.max(0, Number(height) || 0);
  const size = Math.min(safeHeight, safeWidth / 1.15);
  const activity = clamp(Number(motion.activity) || 0, 0, 1);
  const phase = Number(motion.phase) || 0;
  const kick = Math.max(0, Number(state.kick) || 0);
  const time = Number(state.time) || 0;
  const shotSequence = Number(state.shotSequence) || 0;
  const bobX = Math.cos(phase * .5) * activity * size * .008;
  const bobY = Math.abs(Math.sin(phase)) * activity * size * .012;
  const idle = Math.sin(time * 1.8) * size * .002;
  const vibration = kick * Math.sin(time * 150 + shotSequence * 2.37);
  const origin = {
    x: safeWidth * profile.originX + bobX + kick * size * .026 + vibration * size * .006,
    y: safeHeight * profile.originY + bobY + idle + kick * size * .023 - vibration * size * .008,
  };
  const angle = profile.angle + kick * .045 + vibration * .012;
  const muzzleDistance = ((profile.length || .5) + .03) * size;
  return {
    profile,
    size,
    angle,
    origin,
    muzzle: {
      x: origin.x - Math.cos(angle) * muzzleDistance,
      y: origin.y - Math.sin(angle) * muzzleDistance,
    },
  };
}

export class WeaponViewmodel {
  constructor() {
    this.state = { kick: 0, muzzle: 0, melee: 0, time: 0, weaponId: null, shotSequence: 0 };
  }

  triggerShot({ weaponId, profile } = {}) {
    const current = VIEWMODELS[weaponId] || Object.values(VIEWMODELS).find(item => item.kind === profile) || FALLBACK;
    const melee = current.kind === "knife" || current.kind === "axe" || current.kind === "dual-blades";
    const bow = current.kind === "bow";
    this.state = {
      ...this.state,
      weaponId: weaponId || this.state.weaponId,
      kick: melee ? 0 : current.kick || .65,
      muzzle: melee || bow ? 0 : .085,
      melee: melee || bow ? 1 : 0,
      shotSequence: this.state.shotSequence + 1,
    };
  }

  advance(dt) { this.state = advanceWeaponEffects(this.state, Math.min(Math.max(dt, 0), .05)); }

  get firing() { return this.state.muzzle > 0; }

  displayWeaponId(weaponId) {
    const effectActive = this.state.kick > 0 || this.state.muzzle > 0 || this.state.melee > 0;
    return effectActive && this.state.weaponId ? this.state.weaponId : weaponId;
  }

  muzzlePosition(game, width, height, motion = {}) {
    if (!game.player?.alive) return null;
    if (game.player.scoped) return { x: width / 2, y: height / 2 };
    return getViewmodelPose(
      this.displayWeaponId(game.player.weaponId),
      width,
      height,
      motion,
      this.state,
    ).muzzle;
  }

  draw(ctx, game, width, height, motion = {}) {
    if (!game.player?.alive || game.player.scoped) return;
    const weaponId = game.player.weaponId;
    const effectActive = this.state.kick > 0 || this.state.muzzle > 0 || this.state.melee > 0;
    const displayWeaponId = this.displayWeaponId(weaponId);
    const profile = VIEWMODELS[displayWeaponId] || FALLBACK;
    if (!effectActive && this.state.weaponId && this.state.weaponId !== weaponId) {
      this.state = { ...this.state, kick: 0, muzzle: 0, melee: 0, weaponId };
    }
    const pose = getViewmodelPose(displayWeaponId, width, height, motion, this.state);
    const size = pose.size;

    ctx.save();
    ctx.translate(pose.origin.x, pose.origin.y);
    ctx.rotate(pose.angle);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (profile.kind === "rifle") drawRifle(ctx, size, profile, this.state.muzzle / .085);
    if (profile.kind === "pistol") drawPistol(ctx, size, profile, this.state.muzzle / .085);
    if (profile.kind === "dual") {
      ctx.save();
      ctx.translate(size * -.18, size * .115);
      ctx.rotate(-.07);
      drawPistol(ctx, size * .9, profile, this.state.muzzle / .085, size * .01);
      ctx.restore();
      drawPistol(ctx, size, profile, this.state.muzzle / .085);
    }
    if (profile.kind === "bow") drawBow(ctx, size, profile, 1 - this.state.melee);
    if (profile.kind === "knife" || profile.kind === "axe") {
      drawMelee(ctx, size, profile.kind, 1 - this.state.melee);
    }
    if (profile.kind === "dual-blades") drawDualBlades(ctx, size, 1 - this.state.melee);
    ctx.restore();
  }
}

export function getViewmodelProfile(weaponId) { return VIEWMODELS[weaponId] || FALLBACK; }
