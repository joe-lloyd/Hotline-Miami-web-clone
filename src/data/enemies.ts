/**
 * data/enemies.ts — the enemy type registry.
 *
 * To add a new enemy type:
 *   1. add an entry here with a unique `char`
 *   2. use that char in any map in data/levels.ts
 * AI, rig rendering and spawning all read from this table — no code needed.
 *
 *   behavior 'melee'  -> rushes the player; telegraphed windup strike
 *                        that can be PARRIED (windup = parry timing)
 *   behavior 'ranged' -> keeps `range` px away and shoots (ammo/fireCd/
 *                        react); switches to a melee rush when dry
 *
 * hp > 1 means armored: bullets/knives do 1, bats do 2, throws do 2 and
 * stagger survivors; anything kills instantly while staggered.
 */
import type { EnemyDef } from '../types';

export const ENEMY_TYPES: Record<string, EnemyDef> = {

  /** Slow bruiser with a bat — the bread-and-butter threat. */
  goon: {
    char: 'g', name: 'GOON', behavior: 'melee', weapon: 'bat',
    speed: 150, patrolSpeed: 44, sight: 520, hp: 1, r: 11, windup: 0.45, score: 100,
    pal: { jacket: '#8f9bb3', jdark: '#525c72', hair: '#20242e', skin: '#d8b48c', pants: '#20242e' },
  },

  /** Fast knife freak — closes distance scarily quick, short windup. */
  stalker: {
    char: 'n', name: 'STALKER', behavior: 'melee', weapon: 'knife',
    speed: 238, patrolSpeed: 60, sight: 560, hp: 1, r: 10, windup: 0.30, score: 150,
    pal: { jacket: '#39ff88', jdark: '#12904a', hair: '#0a1f12', skin: '#c9a27b', pants: '#0d2a18' },
  },

  /** Keeps distance and shoots; rushes you when the mag runs dry. */
  gunner: {
    char: 'u', name: 'GUNNER', behavior: 'ranged', weapon: 'pistol',
    speed: 118, patrolSpeed: 46, sight: 540, hp: 1, r: 11, score: 150,
    range: 250, ammo: 8, fireCd: 0.55, react: 0.26, windup: 0.40,
    pal: { jacket: '#00e5ff', jdark: '#00778c', hair: '#0a2a33', skin: '#d8b48c', pants: '#06222a' },
  },

  /** Armored shotgunner — takes 3 hits, brutal at close range. */
  heavy: {
    char: 'h', name: 'HEAVY', behavior: 'ranged', weapon: 'shotgun',
    speed: 74, patrolSpeed: 34, sight: 500, hp: 3, r: 14, score: 300,
    range: 200, ammo: 8, fireCd: 1.10, react: 0.35, windup: 0.50,
    pal: { jacket: '#ff8a3d', jdark: '#9c4a12', hair: '#1c1208', skin: '#caa27e', pants: '#3a2210' },
  },
};

/** char -> type-key lookup used by the level parser. */
export const ENEMY_CHARS: Record<string, string> = {};
for (const key of Object.keys(ENEMY_TYPES)) ENEMY_CHARS[ENEMY_TYPES[key].char] = key;
