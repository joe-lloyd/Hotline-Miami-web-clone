/**
 * tracks.ts — Strudel pattern definitions for the level scores.
 *
 * One TrackDef per level, Gesaffelstein-style midtempo industrial. The
 * patterns are BUILT ONCE at module load (pre-compiled ASTs — nothing is
 * parsed or evaluated during gameplay); audio.ts's Cyclist queries them
 * with a lookahead and dispatches each event to a synthesized voice.
 * One Strudel cycle = one 4/4 bar, so cps = bpm / 240.
 *
 * Event values are { inst, n }: `inst` picks the voice (see
 * Synth.playNote), `n` is semitones above the board's musicRoot for
 * pitched voices, or a variant index for drums.
 *
 * No samples anywhere — every voice is oscillator/noise synthesis in
 * audio.ts, which is why we drive Strudel with a custom output instead
 * of superdough (whose stock drums stream from a CDN and whose output
 * is hardwired to ctx.destination, bypassing our FX chain).
 */
import { Fraction, pure, stack, type StrudelPattern } from '@strudel/core';
import { mini } from '@strudel/mini';

export interface TrackNote {
  inst: 'kick' | 'snare' | 'tom' | 'bass' | 'lead' | 'reese' | 'fm' | 'sweep';
  n: number;
}

export interface TrackDef {
  name: string;
  bpm: number;
  pattern: StrudelPattern;
}

/** Tag a pattern's values with the voice that should play them. */
const layer = (inst: TrackNote['inst'], pat: StrudelPattern): StrudelPattern =>
  pat.withValue((v): TrackNote => ({ inst, n: typeof v === 'number' ? v : Number(v) || 0 }));

/**
 * LV.01 — "BREACH" (110 bpm)
 * Unforgiving 4/4 industrial kick, no hats, gated metallic snare on 2+4.
 * Saw bass through a screaming resonant low-pass: syncopated 16th
 * ostinato on the root and minor 3rd. A piercing square lead drops a
 * descending 3-note motif only at the end of every 4-bar phrase.
 * The kick sidechain-pumps everything else (see Synth.vKick).
 */
const breach: TrackDef = {
  name: 'BREACH',
  bpm: 110,
  pattern: stack(
    layer('kick', mini('0*4')),
    layer('snare', mini('~ 0 ~ 0')),
    layer('bass', mini('0 ~ 0 0 ~ 3 0 ~ 0 0 ~ 3 0 ~ 3 ~')),
    layer('lead', mini('<~ ~ ~ [~ ~ ~ [15 12 10]]>')),
  ),
};

/**
 * LV.02 — "DESCENT" (115 bpm)
 * Kick on 1 and 3 over a rolling syncopated 16th tom pattern (the
 * acceleration feel). A detuned 3-saw Reese bass slides between notes
 * over 1-bar intervals instead of stabbing. Atonal FM strikes repeat
 * every 3/16 — a true polyrhythm against the 4/4 grid (Fraction keeps it
 * drift-free). A white-noise high-pass sweep breathes over 8 bars.
 */
const descent: TrackDef = {
  name: 'DESCENT',
  bpm: 115,
  pattern: stack(
    layer('kick', mini('0 ~ 0 ~')),
    layer('tom', mini('~ 0 1 0 ~ 0 ~ 1 2 ~ 0 1 ~ 0 1 2')),
    layer('reese', mini('<0 0 3 -2>')),
    layer('fm', pure(0).fast(Fraction(16).div(3))),
    layer('sweep', pure(0).slow(8)),
  ),
};

/** Index = levelIndex (clamped by playTrack, so extra levels reuse the last). */
export const TRACKS: TrackDef[] = [breach, descent];
