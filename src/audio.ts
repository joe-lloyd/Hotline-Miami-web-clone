/**
 * audio.ts — the synthesized audio engine.
 *
 * Every sound in the game is generated live with WebAudio oscillators
 * and one shared noise buffer. No audio files ship with the game.
 * Phaser's sound system is bypassed entirely.
 *
 * MUSIC: Strudel (@strudel/core + @strudel/mini) is the sequencing
 * brain — patterns live in tracks.ts, pre-compiled at module load, and a
 * Cyclist scheduler clocked by THIS AudioContext queries them with a
 * lookahead. Each event triggers one of the synthesized voices below
 * through a custom output (we deliberately don't use superdough: its
 * output is hardwired to ctx.destination — bypassing our FX chain — and
 * its stock drums stream samples from a CDN, breaking the no-assets
 * rule). Everything shares the one context and master GainNode.
 *
 * MUSIC FX CHAIN:  voices ─▶ pumpBus ─┐
 *                  kick ───▶ kickBus ─┴▶ compressor ─▶ waveshaper ─▶ master
 * The kick bypasses pumpBus and *drives* it: every kick schedules a duck
 * envelope on pumpBus.gain, so bass/lead/texture pump against it
 * (sidechain), then the compressor glues and the waveshaper saturates.
 * SFX go straight to master, unaffected.
 *
 * Usage: init() must be called from a user gesture (the START button),
 * then sfx(name) for one-shots and playTrack(levelIndex, rootHz) per
 * board; stopTrack() ends the score.
 */
import { Cyclist } from '@strudel/core';
import { TRACKS, type TrackNote } from './tracks';

type Filt = { type: BiquadFilterType; freq: number } | null;

export class Synth {
  private actx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  // music chain
  private pumpBus!: GainNode;   // everything but the kick — duck target
  private kickBus!: GainNode;   // the kick — keys the pump, never ducked
  private cyclist: Cyclist | null = null;
  private root = 55;            // board bass root (Hz) — transposes the track
  private reeseFreq = 0;        // previous Reese note, for the 1-bar glides
  private sweepSrc: AudioBufferSourceNode | null = null;

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

    // ---- music FX chain: buses -> compressor -> waveshaper -> master ----
    const a = this.actx;
    const comp = a.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 6;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    const shaper = a.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(2.5 * x);   // aggressive but musical saturation
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    comp.connect(shaper);
    shaper.connect(this.master);
    this.pumpBus = a.createGain();
    this.pumpBus.connect(comp);
    this.kickBus = a.createGain();
    this.kickBus.connect(comp);
  }

  // ================= shared one-shot helpers =================
  private noiseTo(dest: AudioNode, dur: number, gain: number, filt: Filt, when?: number): void {
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
    g.connect(dest);
    s.start(t);
    s.stop(t + dur);
  }

  private beepTo(dest: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number, gain: number, when?: number): void {
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
    g.connect(dest);
    o.start(t);
    o.stop(t + dur);
  }

  private noise(dur: number, gain: number, filt: Filt, when?: number): void {
    if (this.actx) this.noiseTo(this.master, dur, gain, filt, when);
  }

  private beep(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, when?: number): void {
    if (this.actx) this.beepTo(this.master, type, f0, f1, dur, gain, when);
  }

  // ================= sfx =================
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

  // ================= music =================
  /**
   * Mount the level's Strudel pattern (tracks.ts) on the shared Cyclist.
   * Safe to call while a track is running — pattern and tempo swap live.
   * `root` transposes the pitched voices (each board keeps its flavor).
   */
  playTrack(levelIndex: number, root = 55): void {
    if (!this.actx) return;
    this.root = root;
    this.reeseFreq = 0;
    const track = TRACKS[Math.max(0, Math.min(levelIndex, TRACKS.length - 1))];
    if (!this.cyclist) {
      this.cyclist = new Cyclist({
        interval: 0.05,
        latency: 0.15,
        getTime: () => this.actx!.currentTime,
        onTrigger: (hap, _deadline, duration, _cps, targetTime) => {
          this.playNote(hap.value as TrackNote, targetTime, duration);
        },
        onError: () => { /* a bad pattern must never kill the game loop */ },
      });
    }
    // un-mute the buses (stopTrack fades them out)
    const t = this.actx.currentTime;
    for (const b of [this.pumpBus, this.kickBus]) {
      b.gain.cancelScheduledValues(t);
      b.gain.setValueAtTime(1, t);
    }
    this.cyclist.setCps(track.bpm / 240);   // 1 cycle = 1 bar of 4/4
    void this.cyclist.setPattern(track.pattern, true);
  }

  stopTrack(): void {
    if (!this.actx || !this.cyclist) return;
    this.cyclist.stop();
    // already-scheduled voices are killed by fading the buses; the 8-bar
    // sweep is the only source long enough to need an explicit stop
    const t = this.actx.currentTime;
    for (const b of [this.pumpBus, this.kickBus]) {
      b.gain.cancelScheduledValues(t);
      b.gain.setValueAtTime(b.gain.value, t);
      b.gain.linearRampToValueAtTime(0.0001, t + 0.08);
    }
    this.sweepSrc?.stop(t + 0.1);
    this.sweepSrc = null;
  }

  /** Strudel custom output: dispatch one pattern event to a voice. */
  private playNote(v: TrackNote, t: number, dur: number): void {
    if (!this.actx || !v) return;
    switch (v.inst) {
      case 'kick':  this.vKick(t); break;
      case 'snare': this.vSnare(t); break;
      case 'tom':   this.vTom(t, v.n); break;
      case 'bass':  this.vBass(t, v.n, dur); break;
      case 'lead':  this.vLead(t, v.n); break;
      case 'reese': this.vReese(t, v.n, dur); break;
      case 'fm':    this.vFm(t, v.n); break;
      case 'sweep': this.vSweep(t, dur); break;
    }
  }

  // ---------------- music voices (the Gesaffelstein kit) ----------------

  /** Industrial kick — and the sidechain duck that makes the mix pump. */
  private vKick(t: number): void {
    const a = this.actx!;
    const o = a.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.11);
    const g = a.createGain();
    g.gain.setValueAtTime(1.0, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g);
    g.connect(this.kickBus);
    o.start(t);
    o.stop(t + 0.32);
    this.noiseTo(this.kickBus, 0.02, 0.5, { type: 'lowpass', freq: 3000 }, t); // attack click
    // the pump: slam the rest of the mix down, let it swell back
    const p = this.pumpBus.gain;
    p.setValueAtTime(0.22, t);
    p.linearRampToValueAtTime(1, t + 0.26);
  }

  /** Gated metallic snare: flat noise body chopped dead, ringing blips. */
  private vSnare(t: number): void {
    const a = this.actx!;
    const s = a.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 1.1;
    const g = a.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.setValueAtTime(0.4, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.075); // the gate slams
    s.connect(f);
    f.connect(g);
    g.connect(this.pumpBus);
    s.start(t);
    s.stop(t + 0.09);
    this.beepTo(this.pumpBus, 'square', 1244, 1244, 0.06, 0.12, t);
    this.beepTo(this.pumpBus, 'square', 830, 830, 0.05, 0.1, t);
  }

  /** Rolling toms (Descent) — n picks the pitch. */
  private vTom(t: number, n: number): void {
    const f0 = [200, 150, 112][n % 3] ?? 150;
    this.beepTo(this.pumpBus, 'sine', f0, f0 * 0.55, 0.16, 0.5, t);
    this.noiseTo(this.pumpBus, 0.03, 0.12, { type: 'lowpass', freq: 1200 }, t);
  }

  /** Breach bass: saw stab through a screaming resonant LP, fast decay. */
  private vBass(t: number, n: number, dur: number): void {
    const a = this.actx!;
    const o = a.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = this.root * Math.pow(2, n / 12);
    const flt = a.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = 14;
    flt.frequency.setValueAtTime(2200, t);
    flt.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + Math.min(dur * 0.95, 0.18));
    o.connect(flt);
    flt.connect(g);
    g.connect(this.pumpBus);
    o.start(t);
    o.stop(t + 0.2);
  }

  /** Breach lead: piercing square, octaves up, blink and you miss it. */
  private vLead(t: number, n: number): void {
    const f = this.root * 8 * Math.pow(2, n / 12);
    this.beepTo(this.pumpBus, 'square', f, f, 0.14, 0.1, t);
    this.beepTo(this.pumpBus, 'square', f * 2.01, f * 2, 0.1, 0.04, t);
  }

  /** Descent bass: detuned 3-saw Reese + sub, gliding into each note. */
  private vReese(t: number, n: number, dur: number): void {
    const a = this.actx!;
    const f = this.root * Math.pow(2, n / 12);
    const from = this.reeseFreq || f;
    this.reeseFreq = f;
    const end = t + dur;
    const flt = a.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 420;
    flt.Q.value = 2.5;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.06);
    g.gain.setValueAtTime(0.16, end - 0.08);
    g.gain.linearRampToValueAtTime(0.0001, end);
    flt.connect(g);
    g.connect(this.pumpBus);
    for (const det of [-18, 0, 14]) {
      const o = a.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(from, t);
      o.frequency.linearRampToValueAtTime(f, t + dur * 0.5); // the slide
      o.connect(flt);
      o.start(t);
      o.stop(end + 0.02);
    }
    const sub = a.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(from / 2, t);
    sub.frequency.linearRampToValueAtTime(f / 2, t + dur * 0.5);
    sub.connect(g);
    sub.start(t);
    sub.stop(end + 0.02);
  }

  /** Descent lead: atonal FM metallic strike (3/16 polyrhythm). */
  private vFm(t: number, n: number): void {
    const a = this.actx!;
    const base = this.root * 24 * Math.pow(2, n / 12) * (0.98 + Math.random() * 0.05);
    const car = a.createOscillator();
    car.type = 'sine';
    car.frequency.value = base;
    const mod = a.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = base * 2.71; // inharmonic ratio = metal
    const mg = a.createGain();
    mg.gain.setValueAtTime(base * 3.2, t);
    mg.gain.exponentialRampToValueAtTime(1, t + 0.1);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = a.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    car.connect(g);
    g.connect(this.pumpBus);
    car.start(t);
    mod.start(t);
    car.stop(t + 0.14);
    mod.stop(t + 0.14);
  }

  /** Descent texture: 8-bar white-noise breath through a high-pass. */
  private vSweep(t: number, dur: number): void {
    const a = this.actx!;
    const s = a.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = a.createBiquadFilter();
    f.type = 'highpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(6000, t);
    f.frequency.exponentialRampToValueAtTime(300, t + dur * 0.5);  // opens…
    f.frequency.exponentialRampToValueAtTime(6000, t + dur);       // …closes
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + dur * 0.15);
    g.gain.setValueAtTime(0.045, t + dur * 0.85);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.pumpBus);
    s.start(t);
    s.stop(t + dur + 0.05);
    this.sweepSrc = s;
  }
}

/** Shared singleton — the whole game uses one audio context. */
export const audio = new Synth();
