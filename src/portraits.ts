/**
 * portraits.ts — procedural full-body character cutouts for the dialogue
 * overlay (visual-novel scenes).
 *
 * Same rule as textures.ts: no image assets ship with the game. Each
 * portrait is a chunky pixel figure drawn once on an offscreen canvas
 * from the character's CharPalette (the same palette its in-game rig
 * uses, so the big cutout and the tiny top-down sprite read as the same
 * person) and returned as a data URL. The <img> is CSS-scaled with
 * image-rendering: pixelated, so we draw at a small logical grid and let
 * the upscale do the retro work.
 *
 * Pure DOM/canvas — no Phaser. Variants: `fem` (narrower build, pixie
 * fringe), `shades`, `coat` (long coat instead of jacket + pants hips).
 */
import type { StoryChar } from './data/story';

/** Multiply a #rrggbb color by k (clamped) — local shade helper. */
function mul(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  const r = c(n >> 16), g = c((n >> 8) & 255), b = c(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

const GRID_W = 48, GRID_H = 100, SCALE = 4;

export function makePortrait(ch: StoryChar): string {
  const cv = document.createElement('canvas');
  cv.width = GRID_W * SCALE; cv.height = GRID_H * SCALE;
  const g = cv.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE);
  };

  const p = ch.pal;
  const fem = !!p.fem;
  const coat = !!ch.coat;
  const skinD = mul(p.skin, 0.72);
  const jkL = mul(p.jacket, 1.35);
  const boot = '#181022';

  // ---- legs / boots (drawn first, torso overlaps the hips) ----
  const legW = fem ? 6 : 7;
  const legLX = fem ? 16 : 15, legRX = 24 + 2;
  const legTop = coat ? 78 : 62;
  px(legLX, legTop, legW, 93 - legTop, p.pants);
  px(legRX, legTop, legW, 93 - legTop, p.pants);
  // inner-leg shading
  px(legLX + legW - 2, legTop, 2, 93 - legTop, mul(p.pants, 0.7));
  px(legRX + legW - 2, legTop, 2, 93 - legTop, mul(p.pants, 0.7));
  px(legLX - 1, 93, legW + 2, 6, boot);
  px(legRX - 1, 93, legW + 2, 6, boot);

  if (!coat) {
    const hipW = fem ? 18 : 20;
    px(24 - hipW / 2, 54, hipW, 12, p.pants);
  }

  // ---- arms (sleeves outside the torso) ----
  const shW = fem ? 18 : 22;
  const shX = 24 - shW / 2;
  const armLen = coat ? 32 : 28;
  px(shX - 4, 30, 4, armLen, p.jacket);
  px(shX + shW, 30, 4, armLen, p.jdark);
  px(shX - 4, 30 + armLen, 4, 5, p.skin);          // hands
  px(shX + shW, 30 + armLen, 4, 5, skinD);

  // ---- torso: shoulders / chest / waist (fem tapers) ----
  px(shX, 28, shW, 12, p.jacket);                   // shoulders
  const chW = fem ? 16 : 20;
  px(24 - chW / 2, 40, chW, 12, p.jacket);          // chest
  const waW = fem ? 14 : 20;
  px(24 - waW / 2, 52, waW, coat ? 28 : 8, p.jacket); // waist (coat: skirt of the coat)
  if (coat) {
    // open-coat split + hem
    px(23, 58, 2, 22, mul(p.pants, 0.85));
    px(24 - waW / 2, 78, waW, 2, p.jdark);
  }
  // right-side shading + left rim light + zipper + collar
  px(shX + shW - 4, 28, 4, 12, p.jdark);
  px(24 + chW / 2 - 4, 40, 4, 12, p.jdark);
  px(24 + waW / 2 - 3, 52, 3, coat ? 26 : 8, p.jdark);
  px(shX, 28, 1, 12, jkL);
  px(24 - chW / 2, 40, 1, 12, jkL);
  px(23, 30, 1, coat ? 26 : 28, p.jdark);           // zipper
  px(17, 27, 5, 3, p.jdark);                        // collar
  px(26, 27, 5, 3, p.jdark);
  if (fem) { px(18, 41, 5, 2, p.jdark); px(25, 41, 5, 2, p.jdark); } // bust hint

  // ---- neck + head ----
  px(21, 23, 6, 6, p.skin);
  const hdW = fem ? 12 : 14;
  const hdX = 24 - hdW / 2;
  px(hdX, 9, hdW, 14, p.skin);
  px(hdX + 2, 23, hdW - 4, 3, p.skin);              // chin
  px(hdX + hdW - 3, 11, 3, 11, skinD);              // face shading
  px(hdX - 1, 14, 1, 4, p.skin);                    // ears
  px(hdX + hdW, 14, 1, 4, skinD);

  // ---- hair ----
  if (fem) {
    px(hdX - 1, 4, hdW + 2, 7, p.hair);             // pixie cap
    px(hdX, 11, Math.floor(hdW * 0.7), 3, p.hair);  // asymmetric fringe
    px(hdX - 1, 11, 2, 9, p.hair);                  // longer left side
    px(hdX + hdW - 1, 11, 2, 5, p.hair);
  } else {
    px(hdX - 1, 5, hdW + 2, 6, p.hair);
    px(hdX - 1, 11, 2, 6, p.hair);
    px(hdX + hdW - 1, 11, 2, 6, p.hair);
  }

  // ---- face ----
  if (ch.shades) {
    px(hdX + 1, 16, hdW - 2, 4, '#0c0c14');
    px(hdX + 2, 17, 2, 1, '#7fe7ff');               // lens glint
  } else {
    px(20, 15, 3, 1, p.hair); px(26, 15, 3, 1, p.hair); // brows
    px(20, 17, 2, 2, '#151020'); px(26, 17, 2, 2, '#151020');
  }
  if (fem) px(22, 21, 4, 1, '#d16680');             // lips
  else px(23, 21, 3, 1, mul(p.skin, 0.6));

  return cv.toDataURL();
}
