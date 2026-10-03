export class GameAudio {
  constructor() {
    this.context = null;
    this.master = null;
  }

  async unlock() {
    try {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return false;
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = .72;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended") await this.context.resume();
      return this.context.state === "running";
    } catch (error) {
      return false;
    }
  }

  tone(frequency, duration, type = "sine", volume = .05, sweep = 0, delay = 0) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency + sweep), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
  }

  noise(duration = .12, volume = .09, lowpass = 12000, delay = 0) {
    if (!this.context || !this.master) return;
    const frames = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / frames);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const now = this.context.currentTime + delay;
    filter.type = "lowpass";
    filter.frequency.value = lowpass;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
  }

  gunshot(profile = "rifle") {
    const presets = {
      sniper: [.28, .3, 74, .18, 2100],
      rifle: [.12, .19, 118, .09, 4200],
      machinegun: [.09, .16, 104, .075, 3600],
      pistol: [.1, .14, 165, .065, 5600],
      dual: [.08, .13, 190, .055, 6200],
    };
    const [duration, volume, bass, bassVolume, cutoff] = presets[profile] || presets.rifle;
    this.noise(duration, volume, cutoff);
    this.tone(bass, duration * 1.25, "sawtooth", bassVolume, -bass * .55);
    this.tone(profile === "sniper" ? 780 : 1150, .035, "square", .026, -420, .015);
    if (profile === "sniper") this.noise(.42, .06, 900, .08);
  }

  distantShot(profile = "rifle", range = 10) {
    const damp = Math.max(.018, .075 - range * .0025);
    this.noise(profile === "sniper" ? .2 : .1, damp, 1000);
    this.tone(profile === "sniper" ? 72 : 105, .16, "sine", damp * .8, -30);
  }

  tankShot() {
    this.noise(.52, .34, 1800);
    this.tone(52, .62, "sine", .22, -28);
    this.tone(96, .25, "sawtooth", .1, -66);
  }

  explosion(type = "shell") {
    const color = type === "smoke" ? .08 : type === "firework" ? .22 : .29;
    this.noise(type === "smoke" ? .24 : .58, color, type === "firework" ? 5200 : 1450);
    if (type !== "smoke") this.tone(type === "skull" ? 68 : 48, .65, "sine", .15, -24);
    if (type === "firework") {
      [520, 690, 880].forEach((frequency, index) => this.tone(frequency, .13, "triangle", .028, 180, .05 + index * .045));
    }
  }

  knife(kind = "knife") {
    this.noise(kind === "axe" ? .12 : .07, .07, 7000);
    this.tone(kind === "axe" ? 230 : 430, .1, "triangle", .035, -160);
  }

  hit() { this.tone(920, .055, "sine", .035, -280); }
  select() { this.tone(340, .05, "square", .025, 90); }
}
