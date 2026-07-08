/**
 * padmap.ts — remappable controller bindings.
 *
 * One source of truth for what each gamepad button does: PlayScene's
 * per-frame poll reads it for gameplay actions, main.ts's raw-API loop
 * reads it for pause, and the CONTROLLER overlay (main.ts) rebinds it.
 * Bindings persist in localStorage; a rebind steals the button from any
 * action that already used it, so two actions can never share a button.
 *
 * Defaults (standard mapping): RT attack · LT parry · RB or R3 dodge ·
 * LB pick up/throw · A interact · START pause. Menu confirm stays
 * hardwired to A regardless of bindings — it's UI convention, not a
 * gameplay action.
 */

export type PadAction = 'attack' | 'parry' | 'dodge' | 'pickup' | 'interact' | 'pause';

export const PAD_ACTIONS: { id: PadAction; label: string }[] = [
  { id: 'attack', label: 'ATTACK / FIRE' },
  { id: 'parry', label: 'PARRY' },
  { id: 'dodge', label: 'DODGE ROLL' },
  { id: 'pickup', label: 'PICK UP / THROW' },
  { id: 'interact', label: 'INTERACT' },
  { id: 'pause', label: 'PAUSE' },
];

export const BUTTON_NAMES: Record<number, string> = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
  8: 'BACK', 9: 'START', 10: 'L3', 11: 'R3',
  12: 'D-UP', 13: 'D-DOWN', 14: 'D-LEFT', 15: 'D-RIGHT',
};

const DEFAULTS: Record<PadAction, number[]> = {
  attack: [7],       // RT
  parry: [6],        // LT
  dodge: [5, 10],    // RB, clicking the aim stick
  pickup: [4],       // LB
  interact: [0],     // A
  pause: [9],        // START
};

const KEY = 'deaddrop_padmap';

class PadMap {
  map: Record<PadAction, number[]>;

  constructor() {
    this.map = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Record<PadAction, unknown>>;
        for (const a of Object.keys(this.map) as PadAction[]) {
          const v = saved[a];
          if (Array.isArray(v) && v.length && v.every(n => typeof n === 'number'))
            this.map[a] = v as number[];
        }
      }
    } catch { /* corrupted save: keep defaults */ }
  }

  /** All bound button names, e.g. "RB / R3" — for the remap menu. */
  name(a: PadAction): string {
    return this.map[a].map(i => BUTTON_NAMES[i] ?? 'BTN' + i).join(' / ');
  }

  /** Primary button name, e.g. "RB" — for compact HUD hints. */
  primary(a: PadAction): string {
    const i = this.map[a][0];
    return i === undefined ? '?' : (BUTTON_NAMES[i] ?? 'BTN' + i);
  }

  /** Bind an action to exactly this button, stealing it if already used. */
  rebind(a: PadAction, button: number): void {
    for (const other of Object.keys(this.map) as PadAction[]) {
      if (other === a) continue;
      this.map[other] = this.map[other].filter(i => i !== button);
    }
    this.map[a] = [button];
    this.save();
  }

  reset(): void {
    this.map = JSON.parse(JSON.stringify(DEFAULTS));
    this.save();
  }

  private save(): void {
    try { localStorage.setItem(KEY, JSON.stringify(this.map)); } catch { /* private mode */ }
  }
}

export const padmap = new PadMap();
