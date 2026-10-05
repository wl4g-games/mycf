import { SpatialFootstepTracker, createGrenadeAudioCue, spatialize } from "./audio-spatial.js?v=20261005-parental-v8";

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

const WEAPON_RECIPES = Object.freeze({
  barrett: Object.freeze([
    { kind: "noise", role: "blast", duration: .19, volume: .3, highpass: 90, lowpass: 6800 },
    { kind: "noise", role: "crack", duration: .026, volume: .17, highpass: 3600, lowpass: 15000, delay: .004 },
    { kind: "tone", role: "recoil", duration: .34, volume: .18, frequency: 61, sweep: -32, wave: "sawtooth" },
    { kind: "noise", role: "tail", duration: .52, volume: .072, highpass: 55, lowpass: 1150, delay: .075 },
    { kind: "noise", role: "mechanical", duration: .052, volume: .052, highpass: 1800, lowpass: 7600, delay: .305 },
    { kind: "tone", role: "mechanical", duration: .042, volume: .018, frequency: 1380, sweep: -650, wave: "square", delay: .31 },
  ]),
  ak47: Object.freeze([
    { kind: "noise", role: "blast", duration: .115, volume: .21, highpass: 135, lowpass: 7600 },
    { kind: "tone", role: "recoil", duration: .18, volume: .09, frequency: 102, sweep: -57, wave: "sawtooth" },
    { kind: "noise", role: "mechanical", duration: .034, volume: .06, highpass: 2100, lowpass: 9200, delay: .052 },
    { kind: "tone", role: "mechanical", duration: .03, volume: .014, frequency: 1750, sweep: -780, wave: "square", delay: .055 },
    { kind: "noise", role: "tail", duration: .24, volume: .043, highpass: 70, lowpass: 1850, delay: .048 },
  ]),
  policeMG: Object.freeze([
    { kind: "noise", role: "blast", duration: .078, volume: .17, highpass: 170, lowpass: 6500 },
    { kind: "tone", role: "recoil", duration: .12, volume: .066, frequency: 116, sweep: -55, wave: "sawtooth" },
    { kind: "noise", role: "mechanical", duration: .025, volume: .067, highpass: 2600, lowpass: 10500, delay: .035 },
    { kind: "tone", role: "mechanical", duration: .024, volume: .013, frequency: 2200, sweep: -920, wave: "square", delay: .037 },
    { kind: "noise", role: "tail", duration: .15, volume: .034, highpass: 90, lowpass: 2100, delay: .035 },
  ]),
  whitePistol: Object.freeze([
    { kind: "noise", role: "blast", duration: .092, volume: .155, highpass: 220, lowpass: 9400 },
    { kind: "tone", role: "recoil", duration: .13, volume: .058, frequency: 168, sweep: -82, wave: "triangle" },
    { kind: "noise", role: "mechanical", duration: .037, volume: .052, highpass: 3200, lowpass: 12500, delay: .052 },
    { kind: "tone", role: "mechanical", duration: .028, volume: .012, frequency: 2450, sweep: -1100, wave: "square", delay: .055 },
    { kind: "noise", role: "tail", duration: .14, volume: .028, highpass: 120, lowpass: 2600, delay: .035 },
  ]),
  baike: Object.freeze([
    { kind: "noise", role: "blast", duration: .105, volume: .175, highpass: 180, lowpass: 8100 },
    { kind: "tone", role: "recoil", duration: .15, volume: .068, frequency: 142, sweep: -76, wave: "triangle" },
    { kind: "noise", role: "mechanical", duration: .041, volume: .056, highpass: 2800, lowpass: 10800, delay: .057 },
    { kind: "tone", role: "mechanical", duration: .03, volume: .013, frequency: 2140, sweep: -940, wave: "square", delay: .059 },
    { kind: "noise", role: "tail", duration: .17, volume: .032, highpass: 100, lowpass: 2200, delay: .04 },
  ]),
  desertEagle: Object.freeze([
    { kind: "noise", role: "blast", duration: .135, volume: .205, highpass: 145, lowpass: 7900 },
    { kind: "tone", role: "recoil", duration: .2, volume: .087, frequency: 118, sweep: -63, wave: "sawtooth" },
    { kind: "noise", role: "mechanical", duration: .047, volume: .062, highpass: 2450, lowpass: 10500, delay: .072 },
    { kind: "tone", role: "mechanical", duration: .034, volume: .015, frequency: 1980, sweep: -880, wave: "square", delay: .075 },
    { kind: "noise", role: "tail", duration: .23, volume: .04, highpass: 80, lowpass: 1850, delay: .052 },
  ]),
  dualPistols: Object.freeze([
    { kind: "noise", role: "blast", duration: .077, volume: .142, highpass: 260, lowpass: 10200 },
    { kind: "tone", role: "recoil", duration: .105, volume: .052, frequency: 188, sweep: -91, wave: "triangle" },
    { kind: "noise", role: "mechanical", duration: .031, volume: .048, highpass: 3500, lowpass: 13500, delay: .043 },
    { kind: "tone", role: "mechanical", duration: .024, volume: .011, frequency: 2650, sweep: -1250, wave: "square", delay: .045 },
    { kind: "noise", role: "tail", duration: .12, volume: .025, highpass: 140, lowpass: 2850, delay: .03 },
  ]),
});

const PROFILE_WEAPONS = Object.freeze({
  sniper: "barrett",
  rifle: "ak47",
  machinegun: "policeMG",
  pistol: "whitePistol",
  dual: "dualPistols",
});

const GRENADE_THROW_RECIPE = Object.freeze([
  { kind: "noise", role: "pin", duration: .025, volume: .055, highpass: 4300, lowpass: 14000 },
  { kind: "tone", role: "pin", duration: .035, volume: .018, frequency: 3100, sweep: -1200, wave: "square" },
  { kind: "noise", role: "lever", duration: .045, volume: .047, highpass: 1900, lowpass: 8500, delay: .055 },
  { kind: "noise", role: "throw", duration: .12, volume: .038, highpass: 250, lowpass: 2300, delay: .09 },
]);

const EXPLOSION_RECIPES = Object.freeze({
  smoke: Object.freeze([
    { kind: "noise", role: "pop", duration: .12, volume: .13, highpass: 180, lowpass: 4200 },
    { kind: "noise", role: "tail", duration: .7, volume: .055, highpass: 500, lowpass: 2900, delay: .045 },
  ]),
  firework: Object.freeze([
    { kind: "noise", role: "blast", duration: .34, volume: .24, highpass: 170, lowpass: 6200 },
    { kind: "tone", role: "body", duration: .42, volume: .13, frequency: 52, sweep: -25, wave: "sine" },
    { kind: "noise", role: "tail", duration: .52, volume: .06, highpass: 900, lowpass: 7800, delay: .09 },
    { kind: "tone", role: "spark", duration: .12, volume: .026, frequency: 690, sweep: 240, wave: "triangle", delay: .07 },
    { kind: "tone", role: "spark", duration: .1, volume: .023, frequency: 910, sweep: 310, wave: "triangle", delay: .13 },
  ]),
  skull: Object.freeze([
    { kind: "noise", role: "blast", duration: .58, volume: .3, highpass: 55, lowpass: 1900 },
    { kind: "tone", role: "body", duration: .68, volume: .17, frequency: 46, sweep: -23, wave: "sine" },
    { kind: "noise", role: "debris", duration: .32, volume: .072, highpass: 1500, lowpass: 7300, delay: .08 },
    { kind: "noise", role: "tail", duration: .72, volume: .055, highpass: 70, lowpass: 950, delay: .12 },
  ]),
  shell: Object.freeze([
    { kind: "noise", role: "blast", duration: .66, volume: .35, highpass: 45, lowpass: 1700 },
    { kind: "tone", role: "body", duration: .78, volume: .2, frequency: 41, sweep: -20, wave: "sine" },
    { kind: "noise", role: "debris", duration: .38, volume: .08, highpass: 1300, lowpass: 6500, delay: .085 },
    { kind: "noise", role: "tail", duration: .86, volume: .065, highpass: 55, lowpass: 820, delay: .13 },
  ]),
});

function copyPlan(id, layers) {
  return { id, layers: layers.map(layer => ({ ...layer })) };
}

export function createWeaponSoundPlan(weaponId, profile = "rifle") {
  const id = WEAPON_RECIPES[weaponId] ? weaponId : PROFILE_WEAPONS[profile] || "ak47";
  return copyPlan(id, WEAPON_RECIPES[id]);
}

export function createGrenadeThrowSoundPlan(throwableId = "firework") {
  const pitchShift = throwableId === "smoke" ? -.08 : throwableId === "skull" ? -.14 : .06;
  const plan = copyPlan(`throw:${throwableId}`, GRENADE_THROW_RECIPE);
  for (const layer of plan.layers) {
    if (layer.kind === "tone") layer.frequency *= 1 + pitchShift;
  }
  return plan;
}

export function createExplosionSoundPlan(type = "shell") {
  const id = EXPLOSION_RECIPES[type] ? type : "shell";
  return copyPlan(id, EXPLOSION_RECIPES[id]);
}

export function createBowSoundPlan(hit = false) {
  const layers = [
    { kind: "tone", role: "string", duration: .13, volume: .06, frequency: 510, sweep: -330, wave: "triangle" },
    { kind: "noise", role: "release", duration: .065, volume: .047, highpass: 850, lowpass: 6200 },
    { kind: "noise", role: "arrow", duration: .18, volume: .025, highpass: 1700, lowpass: 7200, delay: .035 },
  ];
  if (hit) {
    layers.push(
      { kind: "noise", role: "impact", duration: .055, volume: .048, highpass: 520, lowpass: 3600, delay: .095 },
      { kind: "tone", role: "impact", duration: .07, volume: .022, frequency: 230, sweep: -110, wave: "triangle", delay: .095 },
    );
  }
  return { id: "powerBow", layers };
}

export function createMeleeSoundPlan(weaponId = "swiss", profile = "knife") {
  const dual = weaponId === "dualBlades";
  const axe = profile === "axe";
  const layers = [
    { kind: "noise", role: "swing", duration: axe ? .13 : .075, volume: axe ? .075 : .06, highpass: 450, lowpass: axe ? 4300 : 7600 },
    { kind: "tone", role: "edge", duration: axe ? .12 : .085, volume: .032, frequency: axe ? 230 : 450, sweep: axe ? -150 : -210, wave: "triangle" },
  ];
  if (dual) {
    layers.push(
      { kind: "noise", role: "secondBlade", duration: .065, volume: .052, highpass: 1900, lowpass: 9000, delay: .055 },
      { kind: "tone", role: "secondBlade", duration: .07, volume: .025, frequency: 560, sweep: -260, wave: "triangle", delay: .055 },
    );
  }
  return { id: weaponId, layers };
}

export function createFootstepSoundPlan(relation = "enemy", side = "left") {
  const self = relation === "self";
  const enemy = relation === "enemy";
  const sidePitch = side === "left" ? -.04 : .04;
  return {
    id: `footstep:${relation}:${side}`,
    layers: [
      { kind: "noise", role: "impact", duration: .055, volume: self ? .058 : enemy ? .052 : .043, highpass: 90, lowpass: enemy ? 1350 : self ? 1650 : 1750 },
      { kind: "tone", role: "weight", duration: .075, volume: self ? .034 : enemy ? .033 : .026, frequency: (enemy ? 78 : self ? 84 : 92) * (1 + sidePitch), sweep: -28, wave: "triangle" },
      { kind: "noise", role: "gear", duration: .028, volume: self ? .016 : enemy ? .018 : .014, highpass: 2400, lowpass: 7200, delay: .018 },
    ],
  };
}

export class GameAudio {
  constructor({ translate = key => key, locale = () => "en", footstepTracker = new SpatialFootstepTracker() } = {}) {
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.translate = translate;
    this.locale = locale;
    this.footstepTracker = footstepTracker;
    this.lastCallouts = new Map();
  }

  async unlock() {
    try {
      if (!this.context) {
        if (typeof window === "undefined") return false;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return false;
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = .68;
        if (typeof this.context.createDynamicsCompressor === "function") {
          const compressor = this.context.createDynamicsCompressor();
          compressor.threshold.value = -12;
          compressor.knee.value = 8;
          compressor.ratio.value = 5;
          compressor.attack.value = .003;
          compressor.release.value = .2;
          this.master.connect(compressor).connect(this.context.destination);
        } else {
          this.master.connect(this.context.destination);
        }
        this.createNoiseBuffer();
      }
      if (this.context.state === "suspended") await this.context.resume();
      return this.context.state === "running";
    } catch (error) {
      return false;
    }
  }

  createNoiseBuffer() {
    if (!this.context) return null;
    const frames = Math.max(1, Math.floor(this.context.sampleRate * 1.5));
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) data[index] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  connectSpatial(node, pan = 0) {
    if (!this.context || !this.master) return;
    if (typeof this.context.createStereoPanner === "function") {
      const panner = this.context.createStereoPanner();
      panner.pan.value = clamp(Number(pan) || 0, -1, 1);
      node.connect(panner).connect(this.master);
      return;
    }
    node.connect(this.master);
  }

  tone(frequency, duration, type = "sine", volume = .05, sweep = 0, delay = 0, pan = 0) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency + sweep), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + Math.min(.006, duration * .25));
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain);
    this.connectSpatial(gain, pan);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
  }

  noise(duration = .12, volume = .09, lowpass = 12000, delay = 0, { highpass = 20, pan = 0 } = {}) {
    if (!this.context || !this.master) return;
    const source = this.context.createBufferSource();
    const highFilter = this.context.createBiquadFilter();
    const lowFilter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const now = this.context.currentTime + delay;
    highFilter.type = "highpass";
    highFilter.frequency.value = Math.max(20, highpass);
    lowFilter.type = "lowpass";
    lowFilter.frequency.value = Math.max(highFilter.frequency.value + 20, lowpass);
    gain.gain.setValueAtTime(Math.max(.0002, volume), now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.buffer = this.noiseBuffer || this.createNoiseBuffer();
    source.loop = true;
    source.connect(highFilter).connect(lowFilter).connect(gain);
    this.connectSpatial(gain, pan);
    const offset = source.buffer ? Math.random() * Math.max(.01, source.buffer.duration - .1) : 0;
    source.start(now, offset);
    source.stop(now + duration + .02);
  }

  playPlan(plan, { gain = 1, pan = 0, distance = 0, maxDistance = 36 } = {}) {
    if (!plan) return null;
    const distanceRatio = clamp(distance / Math.max(1, maxDistance), 0, 1);
    for (const layer of plan.layers) {
      const volume = layer.volume * gain;
      const delay = layer.delay || 0;
      if (layer.kind === "tone") {
        this.tone(layer.frequency, layer.duration, layer.wave, volume, layer.sweep || 0, delay, pan);
      } else {
        const lowpass = Math.max(420, layer.lowpass * (1 - distanceRatio * .62));
        this.noise(layer.duration, volume, lowpass, delay, { highpass: layer.highpass, pan });
      }
    }
    return plan;
  }

  weaponShot({ weaponId, profile = "rifle", source, listener, hit = false } = {}) {
    if (profile === "bow") return this.bowShot({ source, listener, hit });
    if (profile === "knife" || profile === "axe") return this.melee({ weaponId, profile, source, listener });
    const spatial = spatialize(source, listener, 38);
    if (!spatial.audible) return null;
    const plan = createWeaponSoundPlan(weaponId, profile);
    const remote = Boolean(source && listener);
    this.playPlan(plan, {
      gain: remote ? Math.max(.055, spatial.gain * .72) : 1,
      pan: spatial.pan,
      distance: spatial.distance,
      maxDistance: 38,
    });
    return plan;
  }

  gunshot(profile = "rifle", weaponId) {
    return this.weaponShot({ weaponId, profile });
  }

  distantShot(profile = "rifle", range = 10, weaponId) {
    if (profile === "bow") return this.bowShot({ distance: range });
    if (profile === "knife" || profile === "axe") return null;
    const normalized = clamp(range / 38, 0, 1);
    const plan = createWeaponSoundPlan(weaponId, profile);
    this.playPlan(plan, { gain: Math.max(.055, Math.pow(1 - normalized, 1.35) * .72), distance: range, maxDistance: 38 });
    return plan;
  }

  bowShot({ source, listener, distance = 0, hit = false } = {}) {
    const spatial = source && listener
      ? spatialize(source, listener, 25)
      : { audible: distance <= 25, distance, gain: Math.pow(1 - clamp(distance / 25, 0, 1), 1.35), pan: 0 };
    if (!spatial.audible) return null;
    const plan = createBowSoundPlan(hit);
    const remote = Boolean((source && listener) || distance > 0);
    this.playPlan(plan, {
      gain: remote ? Math.max(.055, spatial.gain * .78) : 1,
      pan: spatial.pan,
      distance: spatial.distance,
      maxDistance: 25,
    });
    return plan;
  }

  melee({ weaponId, profile = "knife", source, listener } = {}) {
    const spatial = spatialize(source, listener, 8);
    if (!spatial.audible) return null;
    const plan = createMeleeSoundPlan(weaponId, profile);
    this.playPlan(plan, {
      gain: source && listener ? Math.max(.06, spatial.gain * .7) : 1,
      pan: spatial.pan,
      distance: spatial.distance,
      maxDistance: 8,
    });
    return plan;
  }

  tankShot({ source, listener } = {}) {
    const spatial = spatialize(source, listener, 48);
    if (!spatial.audible) return null;
    const plan = {
      id: "tankCannon",
      layers: [
        { kind: "noise", role: "blast", duration: .54, volume: .35, highpass: 45, lowpass: 1900 },
        { kind: "tone", role: "recoil", duration: .65, volume: .22, frequency: 52, sweep: -28, wave: "sine" },
        { kind: "noise", role: "mechanical", duration: .11, volume: .07, highpass: 900, lowpass: 4200, delay: .12 },
        { kind: "noise", role: "tail", duration: .72, volume: .065, highpass: 50, lowpass: 850, delay: .1 },
      ],
    };
    this.playPlan(plan, {
      gain: source && listener ? Math.max(.07, spatial.gain * .9) : 1,
      pan: spatial.pan,
      distance: spatial.distance,
      maxDistance: 48,
    });
    return plan;
  }

  explosion(type = "shell", { source, listener } = {}) {
    const spatial = spatialize(source, listener, 42);
    if (!spatial.audible) return null;
    const plan = createExplosionSoundPlan(type);
    this.playPlan(plan, {
      gain: source && listener ? Math.max(.07, spatial.gain) : 1,
      pan: spatial.pan,
      distance: spatial.distance,
      maxDistance: 42,
    });
    return plan;
  }

  grenadeThrow(event, listener) {
    const cue = createGrenadeAudioCue(event, listener);
    if (cue.audible || cue.relation === "self") {
      const plan = createGrenadeThrowSoundPlan(cue.throwableId);
      this.playPlan(plan, {
        gain: cue.relation === "self" ? 1 : Math.max(.08, cue.gain * .8),
        pan: cue.pan,
        distance: cue.distance,
        maxDistance: cue.relation === "enemy" ? 15 : 11,
      });
      if (cue.relation !== "enemy" || cue.incoming) this.grenadeSignal(cue);
    }
    if (cue.incoming && !cue.audible) this.grenadeSignal(cue);
    if (cue.shouldSpeak) this.speakCallout(cue.messageKey, cue.priority);
    return cue;
  }

  grenadeSignal(cue) {
    if (cue.relation === "enemy") {
      this.tone(980, .085, "square", .035, -190, 0, cue.pan);
      this.tone(720, .11, "square", .03, -120, .1, cue.pan);
      return;
    }
    this.tone(520, .045, "sine", .018, 180, .03, cue.pan);
  }

  speakCallout(messageKey, priority = 1) {
    const now = Date.now();
    const cooldown = priority > 1 ? 900 : 1400;
    const previous = this.lastCallouts.get(messageKey) || 0;
    if (now - previous < cooldown) return false;
    this.lastCallouts.set(messageKey, now);
    const speech = globalThis.speechSynthesis;
    const Utterance = globalThis.SpeechSynthesisUtterance;
    if (!speech || typeof Utterance !== "function") return false;
    const utterance = new Utterance(this.translate(messageKey));
    utterance.lang = this.locale();
    utterance.rate = priority > 1 ? 1.08 : .98;
    utterance.pitch = priority > 1 ? .86 : .94;
    utterance.volume = priority > 1 ? .9 : .72;
    const language = utterance.lang.toLowerCase();
    const voice = speech.getVoices?.().find(item => item.lang?.toLowerCase().startsWith(language.split("-")[0]));
    if (voice) utterance.voice = voice;
    speech.speak(utterance);
    return true;
  }

  updateWorld(game, dt) {
    const cues = this.footstepTracker.update(game, dt);
    for (const cue of cues) this.footstep(cue);
    return cues;
  }

  resetWorld() {
    this.footstepTracker.reset();
  }

  footstep(cue) {
    const plan = createFootstepSoundPlan(cue.relation, cue.side);
    const footSide = cue.side === "left" ? -1 : 1;
    const footPan = cue.relation === "self"
      ? footSide * .18
      : clamp(cue.pan + footSide * .025, -1, 1);
    this.playPlan(plan, {
      gain: cue.relation === "self" ? .9 : Math.max(.045, cue.gain * .72),
      pan: footPan,
      distance: cue.distance,
      maxDistance: 11,
    });
    return plan;
  }

  knife(kind = "knife") {
    return this.melee({ weaponId: kind === "axe" ? "axe" : "swiss", profile: kind });
  }

  hit() { this.tone(920, .055, "sine", .035, -280); }
  select() { this.tone(340, .05, "square", .025, 90); }
}
