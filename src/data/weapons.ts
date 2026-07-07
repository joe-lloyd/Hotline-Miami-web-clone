/**
 * data/weapons.ts — the weapon registry.
 *
 * Add a new weapon by adding an entry to WEAPONS and, if it should spawn
 * on maps, a character in PICKUP_CHARS. Optionally teach textures.ts how
 * to draw it (makeWeaponTextures) — unknown weapons fall back to the
 * pistol sprite, so a new entry is playable immediately.
 *
 *   kind 'melee' -> range (px), arc (radians), cd (s), dmg
 *   kind 'gun'   -> cd (s), pellets, spread (rad), speed (px/s),
 *                   ammo (starting mag), dmg (per pellet)
 *   throwSpeed   -> any weapon with this can be thrown with Q; a thrown
 *                   weapon does 2 dmg and staggers survivors.
 */
import type { WeaponDef } from '../types';

export const WEAPONS: Record<string, WeaponDef> = {
  fists:   { kind: 'melee', name: 'FISTS',   range: 38, arc: 1.5, cd: 0.26, dmg: 1 },
  bat:     { kind: 'melee', name: 'BAT',     range: 62, arc: 2.1, cd: 0.40, dmg: 2, throwSpeed: 820 },
  knife:   { kind: 'melee', name: 'KNIFE',   range: 46, arc: 1.4, cd: 0.20, dmg: 1, throwSpeed: 940 },
  pistol:  { kind: 'gun',   name: 'PISTOL',  cd: 0.22, pellets: 1, spread: 0.03, speed: 960, ammo: 9, dmg: 1, throwSpeed: 780 },
  shotgun: { kind: 'gun',   name: 'SHOTGUN', cd: 0.75, pellets: 7, spread: 0.30, speed: 840, ammo: 5, dmg: 1, throwSpeed: 700 },
};

/** Map characters (levels.ts) that drop weapons on the floor. */
export const PICKUP_CHARS: Record<string, string> = {
  '1': 'bat', '2': 'knife', '3': 'pistol', '4': 'shotgun',
};
