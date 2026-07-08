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
 *                   ammo (FULL mag size — live guns track their own count,
 *                   and a dropped/thrown gun keeps whatever was left in it),
 *                   dmg (per pellet)
 *   grip         -> hold/animation class (CharacterRig): 'melee1h' stabs a
 *                   narrow cone, 'melee2h' sweeps a wide two-handed arc —
 *                   range/arc here ARE the hitbox, so keep them matched to
 *                   the animation shape
 *   throwSpeed   -> any weapon with this can be thrown with Q; a thrown
 *                   weapon does 2 dmg and staggers survivors.
 */
import type { WeaponDef } from '../types';

export const WEAPONS: Record<string, WeaponDef> = {
  fists:   { kind: 'melee', name: 'FISTS',   grip: 'unarmed', range: 38, arc: 1.5, cd: 0.26, cd2: 0.18, dmg: 1, nonlethal: true },
  // bat: two-handed sweep — big wide arc, heavy first swing, quicker chains
  bat:     { kind: 'melee', name: 'BAT',     grip: 'melee2h', range: 62, arc: 2.4, cd: 0.48, cd2: 0.28, dmg: 2, throwSpeed: 820 },
  // knife: point-forward stab — long narrow cone, near-instant follow-ups
  knife:   { kind: 'melee', name: 'KNIFE',   grip: 'melee1h', range: 52, arc: 0.75, cd: 0.22, cd2: 0.11, dmg: 1, throwSpeed: 940 },
  pistol:  { kind: 'gun',   name: 'PISTOL',  grip: 'gun1h',   cd: 0.22, pellets: 1, spread: 0.03, speed: 960, ammo: 9, dmg: 1, throwSpeed: 780 },
  shotgun: { kind: 'gun',   name: 'SHOTGUN', grip: 'gun2h',   cd: 0.75, pellets: 7, spread: 0.30, speed: 840, ammo: 5, dmg: 1, throwSpeed: 700 },
};

/** Map characters (levels.ts) that drop weapons on the floor. */
export const PICKUP_CHARS: Record<string, string> = {
  '1': 'bat', '2': 'knife', '3': 'pistol', '4': 'shotgun',
};
