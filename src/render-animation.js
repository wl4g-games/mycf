const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const normalizeAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function advanceMotionState(previous, sample, dt) {
  const x = Number(sample?.x) || 0;
  const y = Number(sample?.y) || 0;
  const angle = Number(sample?.angle) || 0;
  if (!previous) return { x, y, angle, phase: 0, activity: 0, turn: 0 };
  if (!(dt > 0)) return previous;

  const dx = x - previous.x;
  const dy = y - previous.y;
  const distance = Math.hypot(dx, dy);
  const teleported = distance > 1.25;
  const speed = teleported ? 0 : distance / Math.max(dt, .001);
  const targetActivity = clamp(speed / 2.8, 0, 1);
  const response = targetActivity > previous.activity ? 18 : 4.5;
  const blend = 1 - Math.exp(-dt * response);
  const turnRate = normalizeAngle(angle - previous.angle) / Math.max(dt, .001);
  const targetTurn = teleported ? 0 : clamp(turnRate / 4.5, -1, 1);

  return {
    x,
    y,
    angle,
    phase: teleported ? previous.phase : previous.phase + distance * 10.5,
    activity: previous.activity + (targetActivity - previous.activity) * blend,
    turn: previous.turn + (targetTurn - previous.turn) * (1 - Math.exp(-dt * 12)),
  };
}

export function gaitPose(state = {}) {
  const activity = clamp(Number(state.activity) || 0, 0, 1);
  const wave = Math.sin(Number(state.phase) || 0);
  return {
    activity,
    left: wave * activity,
    right: -wave * activity,
    bounce: Math.abs(wave) * activity,
  };
}

export class MotionTracker {
  constructor() { this.states = new Map(); }

  sample(id, entity, dt) {
    const state = advanceMotionState(this.states.get(id), entity, dt);
    this.states.set(id, state);
    return state;
  }

  get(id) { return this.states.get(id); }

  retain(ids) {
    const active = ids instanceof Set ? ids : new Set(ids);
    for (const id of this.states.keys()) if (!active.has(id)) this.states.delete(id);
  }

  clear() { this.states.clear(); }
}
