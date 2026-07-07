/**
 * data/weapons.ts — the weapon registry.
 *
 * Add a new weapon by adding an entry to WEAPONS and, if it should spawn
 * on maps, a character in PICKUP_CHARS. Optionally teach textures.ts how
 * to draw it (makeWeaponTextures) — unknown weapons fall back to the
 * pistol sprite, so a new entry is playable immediately.
 *
 *   kind 'melee' -> range (px), arc (radians), cd (s) first swing,
 *                   cd2 (s) chained follow-up swing, dmg
 *   nonlethal    -> hits KNOCK DOWN instead of kill (fists); finish downed
 *                   enemies with a stomp. Staggered (parried) targets still
 *                   die to any hit.
 *   kind 'gun'   -> cd (s), pellets, spread (rad), speed (px/s),
 *                   ammo (starting mag), dmg (per pellet)
 *   throwSpeed   -> any weapon with this can be thrown with Q; a thrown
 *                   weapon does 2 dmg and staggers survivors.
 */
import type { WeaponDef } from '../types';

export const WEAPONS: Record<string, WeaponDef> = {
  fists:   { kind: 'melee', name: 'FISTS',   range: 38, arc: 1.5, cd: 0.26, cd2: 0.18, dmg: 1, nonlethal: true },
  // bat: heavy first swing, chains into noticeably quicker follow-ups
  bat:     { kind: 'melee', name: 'BAT',     range: 62, arc: 2.1, cd: 0.48, cd2: 0.28, dmg: 2, throwSpeed: 820 },
  // knife: quick first stab, follow-up stabs are near-instant
  knife:   { kind: 'melee', name: 'KNIFE',   range: 46, arc: 1.4, cd: 0.22, cd2: 0.11, dmg: 1, throwSpeed: 940 },
  pistol:  { kind: 'gun',   name: 'PISTOL',  cd: 0.22, pellets: 1, spread: 0.03, speed: 960, ammo: 9, dmg: 1, throwSpeed: 780 },
  shotgun: { kind: 'gun',   name: 'SHOTGUN', cd: 0.75, pellets: 7, spread: 0.30, speed: 840, ammo: 5, dmg: 1, throwSpeed: 700 },
};

/** Map characters (levels.ts) that drop weapons on the floor. */
export const PICKUP_CHARS: Record<string, string> = {
  '1': 'bat', '2': 'knife', '3': 'pistol', '4': 'shotgun',
};
