/**
 * types.ts — shared type definitions for Dead Drop.
 *
 * Everything the game simulates is plain serializable state ("state
 * objects"): the PlayScene mutates these structs each tick, and the
 * CharacterRig / Door actors read them to drive the visuals. Keeping
 * simulation state separate from Phaser display objects is what lets the
 * headless test suite poke the game logic directly.
 *
 * The *Def types describe the content registries (weapons.ts, enemies.ts,
 * levels.ts) — add content by adding entries of these shapes.
 */

/** Sprite palette for a character rig. Hex CSS colors. */
export interface CharPalette {
  jacket: string;
  jdark: string;
  hair: string;
  skin: string;
  pants: string;
  /** feminine build: narrower shoulders, bust silhouette, ponytail */
  fem?: boolean;
}

/** One entry in the weapon registry (data/weapons.ts). */
export interface WeaponDef {
  kind: 'melee' | 'gun';
  name: string;
  /** melee: reach in px */
  range?: number;
  /** melee: swing arc in radians */
  arc?: number;
  /** seconds between attacks (first swing) */
  cd: number;
  /** melee: faster cooldown for chained follow-up swings (defaults to cd) */
  cd2?: number;
  /** melee: hits knock enemies DOWN instead of killing (fists) — downed
   *  enemies must be finished with a stomp; staggered targets still die */
  nonlethal?: boolean;
  /** damage per hit / per pellet */
  dmg: number;
  /** gun fields */
  pellets?: number;
  spread?: number;
  speed?: number;
  ammo?: number;
  /** present = weapon can be thrown with Q (2 dmg + stagger) */
  throwSpeed?: number;
}

/** One entry in the enemy registry (data/enemies.ts). */
export interface EnemyDef {
  /** unique map character used in levels.ts */
  char: string;
  name: string;
  behavior: 'melee' | 'ranged';
  weapon: string;
  speed: number;
  patrolSpeed: number;
  sight: number;
  hp: number;
  r: number;
  score: number;
  /** melee telegraph time before the strike lands (parry window) */
  windup: number;
  pal: CharPalette;
  /** field of view in radians (total). Outside it you are invisible
   *  unless nearly touching — this is what makes sneaking up work. */
  fov?: number;
  /** seconds of "huh?!" before the enemy can act on first sighting you */
  react?: number;
  /** ranged-only */
  range?: number;
  ammo?: number;
  fireCd?: number;
}

/** One floor (data/levels.ts). */
export interface LevelDef {
  name: string;
  briefing: string[];
  accent: string;
  accent2: string;
  floorA: string;
  floorB: string;
  musicRoot: number;
  map: string[];
}

/** Live player state, mutated by PlayScene. */
export interface PlayerState {
  x: number; y: number; r: number;
  ang: number; moveAng: number; moving: boolean; wphase: number;
  weapon: string; ammo: number; alive: boolean;
  dashT: number; dashCd: number; dashDX: number; dashDY: number; inv: number;
  parryT: number; parryCd: number; parryFx: number;
  atkT: number; swing: number;
  /** melee chain window: >0 means the next swing is a follow-up (cd2) */
  chainT: number;
}

/** Live enemy state, mutated by PlayScene. */
export interface EnemyState {
  type: string;
  x: number; y: number; r: number;
  hp: number; weapon: string; ammo: number;
  ang: number; moveAng: number; moving: boolean; wphase: number;
  alive: boolean; aware: boolean; alertT: number;
  lastSeen: { x: number; y: number } | null;
  react: number; cd: number; windup: number; atkCd: number;
  stun: number; hitFlash: number; rush: boolean;
  patrolT: number; pvx: number; pvy: number;
  /** knocked down by a punch: helpless on the floor until downT expires */
  downed: boolean; downT: number;
  /** whether the enemy had line of sight last tick (react resets on regain) */
  hadLOS: boolean;
  /** time spent scanning at a stale lastSeen before giving up */
  searchT: number;
  /** BFS waypoints (tile centers) toward the current nav target */
  path: { x: number; y: number }[] | null;
  /** countdown until the path is recomputed */
  pathT: number;
}

export interface BulletState {
  x: number; y: number; vx: number; vy: number;
  life: number; friendly: boolean; dmg: number; dead?: boolean;
}

export interface ThrowableState {
  x: number; y: number; vx: number; vy: number;
  w: string; spin: number; life: number; dead?: boolean;
}

export interface PickupState {
  x: number; y: number; w: string; spin: number;
}

export interface DoorState {
  tx: number; ty: number;
  /** 'h': opening in a horizontal wall run; 'v': in a vertical run */
  o: 'h' | 'v';
  open: boolean;
  /** brief cooldown so a swinging door isn't re-triggered every frame */
  busy: number;
}

/** Anything moveEntity can push through the world. */
export interface Body { x: number; y: number; r: number; moving?: boolean; moveAng?: number; }
