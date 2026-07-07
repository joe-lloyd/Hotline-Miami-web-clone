/**
 * audio.ts — the synthesized audio engine.
 *
 * Every sound in the game — gunshots, parries, door kicks, the 128bpm
 * synthwave loop — is generated live with WebAudio oscillators and one
 * shared noise buffer. No audio files ship with the game. Phaser's sound
 * system is bypassed entirely (it is built around loaded assets).
 *
 * Usage: init() must be called from a user gesture (the START button),
 * then sfx(name) for one-shots and startMusic(rootHz) per floor.
 */

type Filt = { type: BiquadFilterType; freq: number } | null;

export class Synth {
  private actx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextT = 0;

  init(): void {
    if (this.actx) {
      if (this.actx.state === 'suspended') void this.actx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.actx = new AC();
    this.master = this.actx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.actx.destination);
    const n = this.actx.sampleRate * 0.5;
    this.noiseBuf = this.actx.createBuffer(1, n, this.actx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  private noise(dur: number, gain: number, filt: Filt, when?: number): void {
    if (!this.actx) return;
    const a = this.actx, t = when ?? a.currentTime;
    const s = a.createBufferSource();
    s.buffer = this.noiseBuf;
    const g = a.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node: AudioNode = s;
    if (filt) {
      const f = a.createBiquadFilter();
      f.type = filt.type;
      f.frequency.value = filt.freq;
      s.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + dur);
  }

  private beep(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, when?: number): void {
    if (!this.actx) return;
    const a = this.actx, t = when ?? a.currentTime;
    const o = a.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur);
  }

  sfx(type: string, opt = 0): void {
    if (!this.actx) return;
    switch (type) {
      case 'shoot':    this.beep('square', 700, 120, 0.09, 0.3); this.noise(0.06, 0.25, { type: 'highpass', freq: 1200 }); break;
      case 'shotgun':  this.noise(0.22, 0.5, { type: 'lowpass', freq: 1400 }); this.beep('square', 200, 60, 0.16, 0.35); break;
      case 'eshoot':   this.beep('sawtooth', 520, 100, 0.09, 0.16); this.noise(0.05, 0.12, { type: 'highpass', freq: 1000 }); break;
      case 'punch':    this.beep('sine', 200, 55, 0.12, 0.4); this.noise(0.05, 0.2, { type: 'lowpass', freq: 500 }); break;
      case 'kill':     this.noise(0.18, 0.4, { type: 'lowpass', freq: 900 }); this.beep('triangle', 300, 90, 0.14, 0.22); break;
      case 'combo':    this.beep('triangle', 400 + Math.min(opt, 8) * 90, 900, 0.12, 0.24); this.noise(0.14, 0.3, { type: 'lowpass', freq: 1200 }); break;
      case 'execute':  this.noise(0.2, 0.45, { type: 'lowpass', freq: 800 }); this.beep('square', 900, 1600, 0.14, 0.2); break;
      case 'dash':     this.beep('sawtooth', 180, 900, 0.16, 0.16); break;
      case 'parry':    this.beep('square', 1200, 2200, 0.12, 0.24); this.beep('triangle', 800, 1800, 0.18, 0.16); this.noise(0.05, 0.15, { type: 'highpass', freq: 3000 }); break;
      case 'parrySwing': this.beep('sine', 600, 1400, 0.08, 0.10); break;
      case 'windup':   this.beep('sawtooth', 90, 260, 0.22, 0.14); break;
      case 'armor':    this.beep('square', 340, 220, 0.06, 0.22); this.noise(0.06, 0.25, { type: 'highpass', freq: 2200 }); break;
      case 'alert':    this.beep('square', 500, 760, 0.09, 0.14); break;
      case 'stagger':  this.beep('triangle', 300, 120, 0.25, 0.2); this.noise(0.1, 0.2, { type: 'lowpass', freq: 600 }); break;
      case 'pickup':   this.beep('square', 500, 1000, 0.1, 0.22); break;
      case 'throw':    this.beep('sawtooth', 700, 200, 0.14, 0.16); break;
      case 'click':    this.beep('square', 200, 180, 0.03, 0.12); break;
      case 'death':    this.noise(0.5, 0.6, { type: 'lowpass', freq: 700 }); this.beep('sawtooth', 300, 40, 0.5, 0.4); break;
      // doors
      case 'doorOpen': this.beep('sine', 140, 90, 0.18, 0.14); this.noise(0.08, 0.08, { type: 'lowpass', freq: 900 }); break;
      case 'kick':     this.noise(0.24, 0.55, { type: 'lowpass', freq: 900 }); this.beep('sine', 120, 40, 0.22, 0.5); this.beep('square', 400, 100, 0.08, 0.18); break;
    }
  }

  /** 128bpm synthwave loop; root = per-floor bass root frequency (Hz). */
  startMusic(root = 55): void {
    if (!this.actx || this.musicTimer) return;
    const a = this.actx;
    this.step = 0;
    this.nextT = a.currentTime + 0.08;
    const spb = 60 / 128 / 4; // 16th notes
    const bass = [0, 0, 7, 0, 0, 0, 5, 0, 0, 0, 7, 3, 0, 0, 10, 0];
    this.musicTimer = setInterval(() => {
      while (this.nextT < a.currentTime + 0.18) {
        const s = this.step % 16, t = this.nextT;
        if (s % 4 === 0) { this.beep('sine', 150, 45, 0.16, 0.5, t); this.noise(0.04, 0.25, { type: 'lowpass', freq: 400 }, t); }
        if (s % 2 === 1) this.noise(0.03, 0.10, { type: 'highpass', freq: 7000 }, t);
        const semi = bass[s];
        if (semi !== undefined) {
          const f = root * Math.pow(2, semi / 12);
          const o = a.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          const g = a.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.16, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, t + spb * 0.9);
          const flt = a.createBiquadFilter();
          flt.type = 'lowpass';
          flt.frequency.value = 700;
          o.connect(flt);
          flt.connect(g);
          g.connect(this.master);
          o.start(t);
          o.stop(t + spb);
        }
        if (s === 6 || s === 14) this.beep('square', root * 4 * Math.pow(2, (s === 6 ? 7 : 3) / 12), root * 2, 0.18, 0.06, t);
        this.step++;
        this.nextT += spb;
      }
    }, 25);
  }

  stopMusic(): void {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

/** Shared singleton — the whole game uses one audio context. */
export const audio = new Synth();
