export class GameAudio {
  constructor() { this.context = null; }

  unlock() {
    this.context ??= new (window.AudioContext || window.webkitAudioContext)();
    this.context.resume().catch(() => {});
  }

  tone(frequency, duration, type = "square", volume = .05, slide = 0) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  noise(duration = .12, volume = .09) {
    if (!this.context) return;
    const frames = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frames; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / frames);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(this.context.destination);
    source.start();
  }

  gunshot() { this.noise(.18, .2); this.tone(88, .2, "sawtooth", .09, -48); }
  tankShot() { this.noise(.45, .32); this.tone(62, .5, "sine", .18, -26); }
  explosion() { this.noise(.55, .28); this.tone(54, .6, "sine", .14, -22); }
  knife() { this.noise(.07, .06); this.tone(430, .08, "triangle", .03, -220); }
  hit() { this.tone(920, .055, "sine", .035, -280); }
  select() { this.tone(340, .05, "square", .025, 90); }
}
