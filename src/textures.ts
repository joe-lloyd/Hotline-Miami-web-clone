/**
 * textures.ts — runtime texture generation.
 *
 * The game ships zero image files. Every sprite — body parts, weapons,
 * doors, glows — is drawn once into a texture at boot (at 4x resolution so
 * it stays crisp under the zoomed camera) and reused by all actors.
 *
 * Character bodies are split into PARTS (torso, head, foot, limb segments,
 * hands) so the CharacterRig can articulate them: limb bars are stretched
 * shoulder->hand / hip->foot each frame, which is what makes arms and legs
 * actually move.
 *
 * IMPORTANT: everything is PRE-COLORED here rather than tinted at runtime
 * — Phaser's setTint is a WebGL-only feature, and this game must render
 * identically on the Canvas fallback. Per-palette parts are keyed by the
 * palette's jacket color ("torso-#ff2d95"), colored variants of shared
 * shapes embed the color in the key ("door-#00e5ff", "glow-#ffd23f").
 */
import Phaser from 'phaser';
import type { CharPalette } from './types';
import { WEAPONS } from './data/weapons';

/** Texture supersampling factor (world px -> texture px). */
export const RES = 4;

export const hexNum = (hex: string): number => parseInt(hex.slice(1), 16);

/** Multiply a hex color's channels by f (lighten > 1, darken < 1). */
export function shade(hex: string, f: number): number {
  const n = hexNum(hex);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255);
}

/** Weapon sprite metadata: texture key + where the grip sits (origin). */
export interface WeaponTex { key: string; originX: number; originY: number }
const weaponTex: Record<string, WeaponTex> = {};

export function getWeaponTex(w: string): WeaponTex {
  return weaponTex[w] ?? weaponTex['pistol'];
}

function g2(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  return scene.add.graphics({ x: 0, y: 0 }).setVisible(false);
}

/** White rounded bar in a given color: the universal limb segment. */
function makeBar(scene: Phaser.Scene, key: string, color: number): void {
  if (scene.textures.exists(key)) return;
  const g = g2(scene);
  g.fillStyle(color, 1);
  g.fillRoundedRect(0, 0, 20 * RES, 5 * RES, 2.4 * RES);
  g.generateTexture(key, 20 * RES, 5 * RES);
  g.destroy();
}

function makeDot(scene: Phaser.Scene, key: string, color: number): void {
  if (scene.textures.exists(key)) return;
  const g = g2(scene);
  g.fillStyle(color, 1);
  g.fillCircle(3 * RES, 3 * RES, 3 * RES);
  g.generateTexture(key, 6 * RES, 6 * RES);
  g.destroy();
}

/** Neon door slab pre-colored with the level's secondary accent. */
export function makeDoorTexture(scene: Phaser.Scene, accent2: string): string {
  const key = 'door-' + accent2;
  if (!scene.textures.exists(key)) {
    const g = g2(scene);
    g.fillStyle(hexNum(accent2), 1);
    g.fillRoundedRect(0, 0, 32 * RES, 6 * RES, 1.5 * RES);
    g.fillStyle(shade(accent2, 0.45), 1);
    g.fillRoundedRect(2 * RES, 2 * RES, 28 * RES, 2 * RES, RES);
    g.generateTexture(key, 32 * RES, 6 * RES);
    g.destroy();
  }
  return key;
}

/** Radial glow disc in a given color (pickup auras). */
export function makeGlowTexture(scene: Phaser.Scene, hex: string): string {
  const key = 'glow-' + hex;
  if (!scene.textures.exists(key)) {
    const size = 24 * RES;
    const cv = scene.textures.createCanvas(key, size, size);
    if (cv) {
      const ctx = cv.getContext();
      const n = hexNum(hex);
      const rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
      const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grd.addColorStop(0, `rgba(${rgb},0.9)`);
      grd.addColorStop(0.5, `rgba(${rgb},0.28)`);
      grd.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, size, size);
      cv.refresh();
    }
  }
  return key;
}

/** Build the shared, palette-independent textures. Call once at boot. */
export function makeSharedTextures(scene: Phaser.Scene): void {
  const R = RES;

  makeDot(scene, 'dot', 0xffffff);

  // shadow: soft dark ellipse under every character
  if (!scene.textures.exists('shadow')) {
    const g = g2(scene);
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(12 * R, 9 * R, 22 * R, 16 * R);
    g.generateTexture('shadow', 24 * R, 18 * R);
    g.destroy();
  }

  // weapons (drawn pointing +x, grip near x = 3 world px)
  const mk = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void, gripX = 3) => {
    if (!scene.textures.exists(key)) {
      const g = g2(scene);
      draw(g);
      g.generateTexture(key, w * R, h * R);
      g.destroy();
    }
    weaponTex[key.slice(4)] = { key, originX: gripX / w, originY: 0.5 };
  };

  mk('wpn-bat', 26, 8, (g) => {
    g.fillStyle(0x7a4a1e, 1);
    g.fillRect(0, 2.2 * R, 10 * R, 3.6 * R);
    g.fillStyle(0xc98a3e, 1);
    g.fillRoundedRect(10 * R, 0.75 * R, 15 * R, 6.5 * R, 3 * R);
  });

  mk('wpn-knife', 20, 6, (g) => {
    g.fillStyle(0x333333, 1);
    g.fillRect(0, 1.5 * R, 6 * R, 3 * R);
    g.fillStyle(0xe7f9ff, 1);
    g.fillTriangle(6 * R, 0.8 * R, 19 * R, 3 * R, 6 * R, 5.2 * R);
  });

  mk('wpn-pistol', 16, 7, (g) => {
    g.fillStyle(0x1a1a1a, 1);
    g.fillRect(0, 1.5 * R, 12 * R, 4 * R);
    g.fillStyle(0x2e2e38, 1);
    g.fillRect(8 * R, 1.5 * R, 7 * R, 2.2 * R);
  }, 2);

  mk('wpn-shotgun', 32, 7, (g) => {
    g.fillStyle(0x2a1a0a, 1);
    g.fillRect(0, 1.2 * R, 10 * R, 4.6 * R);
    g.fillStyle(0x33333d, 1);
    g.fillRect(10 * R, 1 * R, 18 * R, 4.8 * R);
    g.fillStyle(0x555555, 1);
    g.fillRect(27 * R, 1 * R, 4 * R, 4.8 * R);
  });

  // any weapon without its own texture uses the pistol shape
  for (const w of Object.keys(WEAPONS)) {
    if (!weaponTex[w]) weaponTex[w] = { key: 'wpn-pistol', originX: 2 / 16, originY: 0.5 };
  }
}

/** All part texture keys a rig needs, in living + corpse variants. */
export interface PalKeys {
  torso: string; torsoDark: string;
  head: string; headDark: string;
  foot: string; footDark: string;
  sleeve: string; leg: string; hand: string;
}

/**
 * Build (or fetch) the palette-specific parts. Legs are drawn brighter
 * than the pants color so they read against the dark neon floors.
 */
export function makeCharTextures(scene: Phaser.Scene, pal: CharPalette): PalKeys {
  const id = pal.jacket;
  const keys: PalKeys = {
    torso: 'torso-' + id, torsoDark: 'torsoD-' + id,
    head: 'head-' + id, headDark: 'headD-' + id,
    foot: 'foot-' + id, footDark: 'footD-' + id,
    sleeve: 'sleeve-' + id, leg: 'leg-' + id, hand: 'hand-' + id,
  };
  if (scene.textures.exists(keys.torso)) return keys;
  const R = RES;

  const torso = (key: string, f: number) => {
    const g = g2(scene);
    const cx = 10 * R, cy = 11 * R;
    g.lineStyle(1.6 * R, shade(pal.jdark, f), 1);
    g.fillStyle(shade(pal.jacket, f), 1);
    g.fillCircle(cx - 1.5 * R, cy - 7 * R, 3.1 * R);
    g.strokeCircle(cx - 1.5 * R, cy - 7 * R, 3.1 * R);
    g.fillCircle(cx - 1.5 * R, cy + 7 * R, 3.1 * R);
    g.strokeCircle(cx - 1.5 * R, cy + 7 * R, 3.1 * R);
    g.fillEllipse(cx - 0.5 * R, cy, 15.2 * R, 18 * R);
    g.strokeEllipse(cx - 0.5 * R, cy, 15.2 * R, 18 * R);
    g.lineStyle(1.1 * R, shade(pal.jdark, f), 1);
    g.lineBetween(cx + 2.5 * R, cy, cx + 6.8 * R, cy);
    g.generateTexture(key, 20 * R, 22 * R);
    g.destroy();
  };
  torso(keys.torso, 1);
  torso(keys.torsoDark, 0.55);

  const head = (key: string, f: number) => {
    const g = g2(scene);
    const cx = 7 * R, cy = 7 * R;
    g.fillStyle(shade(pal.hair, f), 1);
    g.fillCircle(cx - 0.8 * R, cy, 5.7 * R);
    g.fillStyle(shade(pal.skin, f), 1);
    g.fillCircle(cx + 1.6 * R, cy, 4.4 * R);
    g.generateTexture(key, 14 * R, 14 * R);
    g.destroy();
  };
  head(keys.head, 1);
  head(keys.headDark, 0.55);

  const foot = (key: string, f: number) => {
    const g = g2(scene);
    g.fillStyle(shade(pal.pants, 1.6 * f), 1);
    g.fillRoundedRect(0, 0, 7 * R, 5 * R, 2 * R);
    g.generateTexture(key, 7 * R, 5 * R);
    g.destroy();
  };
  foot(keys.foot, 1);
  foot(keys.footDark, 0.6);

  makeBar(scene, keys.sleeve, shade(pal.jdark, 1.15));
  makeBar(scene, keys.leg, shade(pal.pants, 1.7));
  makeDot(scene, keys.hand, hexNum(pal.skin));

  return keys;
}
