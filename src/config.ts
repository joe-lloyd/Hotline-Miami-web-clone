/**
 * config.ts — every "game feel" tuning knob in one place.
 *
 * Nothing here is wired to content; these are the global constants that
 * shape how the game plays: movement speeds, dodge i-frames, the parry
 * window, camera behavior, scoring rules. If a designer wants the game
 * faster/slower/fairer, this is the only file they should need.
 */
import type { CharPalette } from './types';

export const TILE = 32;          // world pixels per tile
export const VIEW_W = 960;       // internal render resolution
export const VIEW_H = 600;
export const ZOOM = 1.65;        // camera zoom — higher = tighter on the player

/**
 * Movement-vs-wall collision shaping. Only used by circleWall/moveEntity;
 * bullet, melee and pickup range checks still use the full body radius.
 */
export const COLLIDE = {
  // circleWall samples its 4 corner points at this fraction of r, rounding
  // the effective body so a 10px-r circle doesn't snag on the frame of a
  // one-tile (32px) doorway. The center sample stays at [0,0].
  cornerR: 0.7,
  // Corner slip: when an axis move is blocked, probe a perpendicular nudge
  // of slipFrac * |move| (both directions, also at 2x) and slide through if
  // the nudged diagonal clears — off-center doorway approaches glide in
  // instead of stopping dead on the frame.
  slipFrac: 0.6,
};

/**
 * Wall faces that touch floor are drawn inset by this many px (visual
 * only — the collision grid stays full-tile). Walls read thinner and
 * doorway openings read wider; the neon trim follows the inset face.
 */
export const WALL_INSET = 6;

/** Camera follow feel. */
export const CAM = {
  lerp: 0.09,        // Phaser follow lerp (0..1 per frame at 60fps)
  lookAhead: 0.24,   // fraction of the player->mouse vector to peek toward
  lookMax: 95,       // max look-ahead distance in world px
};

export const PLAYER = {
  r: 10,
  speed: 205,
  // dodge roll (SHIFT / SPACE): fast, brief, grants i-frames
  dashSpeed: 740,
  dashTime: 0.15,
  dashCd: 0.85,
  dashInv: 0.28,
  // parry (RIGHT-CLICK / F): active window after the tap
  parryWindow: 0.22,
  parryCd: 0.95,
  parryRadius: 58,   // enemy bullets inside this ring get deflected
};

export const PLAYER_PAL: CharPalette = {
  jacket: '#ff2d95', jdark: '#a8175f', hair: '#20202b', skin: '#ffcfa8', pants: '#2a1030',
  fem: true, // reads as a woman from top-down: shoulders, black pixie cut, bust silhouette
};

export const COMBO_TIME = 3.2;      // seconds before a kill combo resets
export const PARRY_SCORE = 50;      // points per deflect / parried strike
export const EXECUTE_BONUS = 2;     // score multiplier on staggered/stomped kills
export const GUNSHOT_NOISE = 360;   // gunshots alert every enemy in this radius
export const KICK_NOISE = 260;      // a kicked door alerts enemies in this radius
export const STAGGER_TIME = 1.6;    // how long a parried attacker stays helpless

/** Enemy vision & senses. */
export const ENEMY_FOV = 2.4;        // default field of view (radians, total ≈ 137°)
export const CLOSE_SENSE = 34;       // inside this range enemies notice you regardless of facing
export const SEARCH_TIME = 2.4;      // seconds spent scanning at a stale last-seen spot before giving up

/** Punch knockdown (fists are nonlethal). */
export const DOWN_TIME = 2.6;        // how long a punched enemy stays on the floor
export const STOMP_RANGE = 34;       // stomp reach (added to the enemy radius)
export const KILL_FLASH = 0.45;      // seconds the level background pulses red on a kill

/** Door kick: enemies this close behind a kicked door get staggered. */
export const KICK_RADIUS = 64;
export const KICK_SCORE = 25;

export const BEST_KEY = 'deaddrop_best';  // localStorage key (shared with the legacy build)
