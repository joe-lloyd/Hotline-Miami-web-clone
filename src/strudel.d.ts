/**
 * strudel.d.ts — minimal typings for the untyped Strudel packages.
 * Only the surface audio.ts/tracks.ts actually use is declared.
 */
declare module '@strudel/core' {
  export interface StrudelPattern {
    withValue(fn: (v: unknown) => unknown): StrudelPattern;
    fast(k: number | unknown): StrudelPattern;
    slow(k: number | unknown): StrudelPattern;
    queryArc(begin: number, end: number, ctx?: unknown): unknown[];
  }
  export function pure(value: unknown): StrudelPattern;
  export function stack(...pats: StrudelPattern[]): StrudelPattern;
  export const silence: StrudelPattern;
  export const Fraction: (n: number | string) => { div(n: number): unknown };
  export class Cyclist {
    constructor(opts: {
      interval?: number;
      latency?: number;
      getTime: () => number;
      onTrigger?: (
        hap: { value: unknown },
        deadline: number,
        duration: number,
        cps: number,
        targetTime: number,
      ) => void;
      onError?: (e: unknown) => void;
      onToggle?: (started: boolean) => void;
    });
    started: boolean;
    setCps(cps: number): void;
    setPattern(pat: StrudelPattern, autostart?: boolean): Promise<void>;
    start(): Promise<void>;
    stop(): void;
  }
}

declare module '@strudel/mini' {
  import type { StrudelPattern } from '@strudel/core';
  export function mini(...code: string[]): StrudelPattern;
}
