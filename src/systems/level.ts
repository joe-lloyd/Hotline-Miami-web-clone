/**
 * systems/level.ts — ASCII map parser.
 *
 * Turns a LevelDef's map strings into everything the PlayScene needs:
 * the collision grid, spawn points for the player / enemies / pickups,
 * door states (with hinge orientation derived from neighboring walls),
 * the exit tile, and the precomputed neon-trim edge segments (every wall
 * face that touches floor gets a glowing line).
 *
 * This is pure data-in data-out — no Phaser objects — so it is trivially
 * unit-testable and reusable by tools (the map generator/validator used
 * to build the shipped floors follows the same rules).
 */
import { TILE, WALL_INSET } from '../config';
import { ENEMY_CHARS } from '../data/enemies';
import { PICKUP_CHARS } from '../data/weapons';
import type { DoorState, LevelDef } from '../types';

export interface ParsedLevel {
  grid: number[][];          // 1 = wall, 0 = walkable (doors are 0 here)
  W: number;
  H: number;
  worldW: number;
  worldH: number;
  player: { x: number; y: number };
  exit: { tx: number; ty: number };
  doors: DoorState[];
  enemies: { type: string; x: number; y: number }[];
  pickups: { w: string; x: number; y: number }[];
  /** wall edges that touch floor, as [x1,y1,x2,y2] world-px segments */
  edges: [number, number, number, number][];
}

export function parseLevel(L: LevelDef): ParsedLevel {
  const T = TILE;
  const rows = L.map;
  const H = rows.length, W = rows[0].length;
  const grid: number[][] = [];
  const doors: DoorState[] = [];
  const enemies: ParsedLevel['enemies'] = [];
  const pickups: ParsedLevel['pickups'] = [];
  let player = { x: T * 1.5, y: T * 1.5 };
  let exit = { tx: 1, ty: 1 };

  for (let y = 0; y < H; y++) {
    const grow: number[] = [];
    for (let x = 0; x < W; x++) {
      const c = rows[y][x];
      grow.push(c === '#' ? 1 : 0);
      const wx = x * T + T / 2, wy = y * T + T / 2;
      if (c === 'P') player = { x: wx, y: wy };
      else if (c === 'X') exit = { tx: x, ty: y };
      else if (c === '+') doors.push({ tx: x, ty: y, o: 'h', open: false, busy: 0 });
      else if (ENEMY_CHARS[c]) enemies.push({ type: ENEMY_CHARS[c], x: wx, y: wy });
      else if (PICKUP_CHARS[c]) pickups.push({ w: PICKUP_CHARS[c], x: wx, y: wy });
    }
    grid.push(grow);
  }

  // door orientation: walls left+right => opening in a horizontal wall run
  const wall = (x: number, y: number) => grid[y] !== undefined && grid[y][x] === 1;
  for (const d of doors) d.o = wall(d.tx - 1, d.ty) && wall(d.tx + 1, d.ty) ? 'h' : 'v';

  // neon trim segments — pushed WALL_INSET px into the wall tile so the
  // trim hugs the visible (inset) wall face drawn by buildWorldImage.
  // Segment ENDS are clamped too: where the perpendicular neighbor is
  // open floor the wall face is inset, so the line must stop with it
  // instead of poking out over the floor.
  const edges: ParsedLevel['edges'] = [];
  const I = WALL_INSET;
  const open = (x: number, y: number) => y >= 0 && y < H && x >= 0 && x < W && grid[y][x] === 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (grid[y][x] !== 1) continue;
    const cutL = open(x - 1, y) ? I : 0, cutR = open(x + 1, y) ? I : 0;
    const cutT = open(x, y - 1) ? I : 0, cutB = open(x, y + 1) ? I : 0;
    if (open(x, y - 1)) edges.push([x * T + cutL, y * T + I, x * T + T - cutR, y * T + I]);
    if (open(x, y + 1)) edges.push([x * T + cutL, y * T + T - I, x * T + T - cutR, y * T + T - I]);
    if (open(x - 1, y)) edges.push([x * T + I, y * T + cutT, x * T + I, y * T + T - cutB]);
    if (open(x + 1, y)) edges.push([x * T + T - I, y * T + cutT, x * T + T - I, y * T + T - cutB]);
  }

  return { grid, W, H, worldW: W * T, worldH: H * T, player, exit, doors, enemies, pickups, edges };
}
