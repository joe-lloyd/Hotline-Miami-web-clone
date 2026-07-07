/**
 * scenes/PlayScene.ts — the game itself.
 *
 * Owns the simulation: player control (move / dodge roll / parry /
 * attack), enemy AI (patrol -> alert -> chase/shoot, telegraphed melee
 * windups), bullets, throwables, doors, scoring and the camera.
 *
 * Design notes:
 *   - Simulation state lives in plain structs (types.ts); Phaser objects
 *     (CharacterRig, Door, sprites) are pure visuals driven from that
 *     state. The headless test suite manipulates the structs directly.
 *   - Collision is hand-rolled tile lookup (solid()), not Arcade physics:
 *     one-hit-kill gameplay needs exact, deterministic checks. Closed
 *     doors count as solid for movement, bullets AND line-of-sight.
 *   - Slow-motion (parry reward) scales the sim dt and tween timescale.
 *   - The scene communicates outward only through game events:
 *     'dd-death' and 'dd-exit' (both carry the current score); main.ts
 *     owns the menu/briefing/overlay flow.
 *
 * The static world (floor checkerboard, walls, neon trim) is rendered
 * once into a generated texture per floor; per-frame drawing is limited
 * to two Graphics layers (vision cones under actors, fx above them).
 */
import Phaser from 'phaser';
import {
  TILE, ZOOM, CAM, PLAYER, PLAYER_PAL, COMBO_TIME, PARRY_SCORE, EXECUTE_BONUS,
  GUNSHOT_NOISE, STAGGER_TIME, KICK_RADIUS, KICK_SCORE,
} from '../config';
import { WEAPONS } from '../data/weapons';
import { ENEMY_TYPES } from '../data/enemies';
import { LEVELS } from '../data/levels';
import { parseLevel, type ParsedLevel } from '../systems/level';
import { CharacterRig } from '../actors/CharacterRig';
import { Door } from '../actors/Door';
import { audio } from '../audio';
import { hexNum, makeGlowTexture } from '../textures';
import type {
  Body, BulletState, EnemyState, LevelDef, PickupState, PlayerState, ThrowableState,
} from '../types';

interface PickupActor { st: PickupState; spr: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }
interface ThrowActor { st: ThrowableState; spr: Phaser.GameObjects.Image }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; c: number; r: number }
interface Flash { x: number; y: number; t: number; ttl: number }
interface Trail { x: number; y: number; ang: number; life: number; max: number }

const GLOW_COLORS: Record<string, string> = {
  bat: '#ffd23f', knife: '#e7f9ff', pistol: '#00e5ff', shotgun: '#ff8a3d',
};

export class PlayScene extends Phaser.Scene {
  // --- content ---
  levelIndex = 0;
  L!: LevelDef;
  lvl!: ParsedLevel;

  // --- sim state (public: the test suite reaches in) ---
  player!: PlayerState;
  enemies: EnemyState[] = [];
  bullets: BulletState[] = [];
  throwables: ThrowActor[] = [];
  pickups: PickupActor[] = [];
  particles: Particle[] = [];
  flashes: Flash[] = [];
  trail: Trail[] = [];
  doors: Door[] = [];
  score = 0;
  combo = 0;
  comboT = 0;
  cleared = false;
  over = false;          // death/exit already fired
  ts = 1;                // timescale (slow-mo)
  slowT = 0;

  // --- visuals ---
  private playerRig!: CharacterRig;
  private rigs = new Map<EnemyState, CharacterRig>();
  private doorMap = new Map<string, Door>();
  private fxG!: Phaser.GameObjects.Graphics;
  private coneG!: Phaser.GameObjects.Graphics;
  private decalRT!: Phaser.GameObjects.RenderTexture;
  private stampG!: Phaser.GameObjects.Graphics;
  private exitText!: Phaser.GameObjects.Text;
  private exitPulse = 0;
  private time2 = 0;

  // --- input ---
  private keysObj!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private mouseDown = false;
  attackTap = false;
  dashTap = false;
  parryTap = false;
  pickTap = false;

  constructor() { super('play'); }

  init(data: { levelIndex?: number; score?: number }): void {
    this.levelIndex = data.levelIndex ?? 0;
    this.score = data.score ?? 0;
  }

  // ================= creation =================
  create(): void {
    this.L = LEVELS[this.levelIndex];
    this.lvl = parseLevel(this.L);
    const lvl = this.lvl;

    // reset per-run state (scene instances are reused by restarts)
    this.enemies = []; this.bullets = []; this.throwables = [];
    this.pickups = []; this.particles = []; this.flashes = []; this.trail = [];
    this.doors = []; this.rigs.clear(); this.doorMap.clear();
    this.combo = 0; this.comboT = 0;
    this.cleared = false; this.over = false;
    this.ts = 1; this.slowT = 0;
    this.mouseDown = false;
    this.attackTap = this.dashTap = this.parryTap = this.pickTap = false;

    this.buildWorldImage();

    this.decalRT = this.add.renderTexture(0, 0, lvl.worldW, lvl.worldH).setOrigin(0, 0).setDepth(1);
    this.stampG = this.add.graphics().setVisible(false);
    this.coneG = this.add.graphics().setDepth(2);
    this.fxG = this.add.graphics().setDepth(7);

    // doors
    for (const d of lvl.doors) {
      const door = new Door(this, d, this.L.accent2);
      door.setDepth(5);
      this.doors.push(door);
      this.doorMap.set(d.tx + ',' + d.ty, door);
    }

    // player
    this.player = {
      x: lvl.player.x, y: lvl.player.y, r: PLAYER.r,
      ang: -1.2, moveAng: -1.2, moving: false, wphase: 0,
      weapon: 'fists', ammo: 0, alive: true,
      dashT: 0, dashCd: 0, dashDX: 0, dashDY: 0, inv: 0,
      parryT: 0, parryCd: 0, parryFx: 0,
      atkT: 0, swing: 0,
    };
    this.playerRig = new CharacterRig(this, this.player.x, this.player.y, PLAYER_PAL, PLAYER.r);
    this.playerRig.setDepth(6);

    // enemies
    for (const spawn of lvl.enemies) this.spawnEnemy(spawn.type, spawn.x, spawn.y);

    // pickups
    for (const p of lvl.pickups) this.spawnPickup(p.w, p.x, p.y);

    // exit label
    const T = TILE;
    this.exitText = this.add.text(lvl.exit.tx * T + T / 2, lvl.exit.ty * T + T / 2 - 24, 'EXIT', {
      fontFamily: "'Press Start 2P', monospace", fontSize: '8px', color: this.L.accent2,
    }).setOrigin(0.5).setDepth(7).setVisible(false);

    // camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, lvl.worldW, lvl.worldH);
    cam.setZoom(ZOOM);
    cam.startFollow(this.playerRig.root, false, CAM.lerp, CAM.lerp);

    this.bindInput();
  }

  /** Render the static world (floor, walls, neon trim) into one texture. */
  private buildWorldImage(): void {
    const key = 'world-' + this.levelIndex;
    if (!this.textures.exists(key)) {
      const lvl = this.lvl, T = TILE;
      const g = this.add.graphics().setVisible(false);
      for (let y = 0; y < lvl.H; y++) for (let x = 0; x < lvl.W; x++) {
        if (lvl.grid[y][x] === 1) {
          g.fillStyle(0x2a0f3d, 1);
          g.fillRect(x * T, y * T, T, T);
          g.fillStyle(0x1c0a2a, 1);
          g.fillRect(x * T, y * T + T - 6, T, 6);
        } else {
          g.fillStyle(hexNum(((x + y) & 1) ? this.L.floorA : this.L.floorB), 1);
          g.fillRect(x * T, y * T, T, T);
        }
      }
      // neon trim: soft pass + crisp pass
      for (const [w, a] of [[4.5, 0.10], [1.4, 0.55]] as const) {
        g.lineStyle(w, hexNum(this.L.accent), a);
        g.beginPath();
        for (const e of lvl.edges) { g.moveTo(e[0], e[1]); g.lineTo(e[2], e[3]); }
        g.strokePath();
      }
      g.generateTexture(key, lvl.worldW, lvl.worldH);
      g.destroy();
    }
    this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
  }

  private bindInput(): void {
    const kb = this.input.keyboard!;
    this.keysObj = kb.addKeys('W,A,S,D') as PlayScene['keysObj'];
    kb.on('keydown-SHIFT', () => { this.dashTap = true; });
    kb.on('keydown-SPACE', () => { this.dashTap = true; });
    kb.on('keydown-F', () => { this.parryTap = true; });
    kb.on('keydown-Q', () => { this.parryTap = true; });
    kb.on('keydown-E', () => { this.pickTap = true; });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.button === 0) { this.mouseDown = true; this.attackTap = true; }
      if (p.button === 2) this.parryTap = true;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.button === 0) this.mouseDown = false;
    });
  }

  private spawnEnemy(type: string, x: number, y: number): void {
    const def = ENEMY_TYPES[type];
    const e: EnemyState = {
      type, x, y, r: def.r, hp: def.hp, weapon: def.weapon, ammo: def.ammo ?? 0,
      ang: Math.random() * 6.28, moveAng: 0, moving: false, wphase: Math.random() * 6,
      alive: true, aware: false, alertT: 0, lastSeen: null,
      react: 0, cd: 0, windup: 0, atkCd: 0, stun: 0, hitFlash: 0,
      rush: def.behavior === 'melee',
      patrolT: 0, pvx: 0, pvy: 0,
    };
    this.enemies.push(e);
    const rig = new CharacterRig(this, x, y, def.pal, def.r);
    rig.setDepth(6);
    rig.setWeapon(def.weapon);
    this.rigs.set(e, rig);
  }

  spawnPickup(w: string, x: number, y: number): void {
    const glowKey = makeGlowTexture(this, GLOW_COLORS[w] ?? '#ffffff');
    const glow = this.add.image(x, y, glowKey).setDepth(4).setAlpha(0.5).setScale(0.35);
    const sprKey = this.textures.exists('wpn-' + w) ? 'wpn-' + w : 'wpn-pistol';
    const spr = this.add.image(x, y, sprKey).setDepth(4).setScale(0.25);
    this.pickups.push({ st: { x, y, w, spin: Math.random() * 6 }, spr, glow });
  }

  // ================= collision =================
  /** Solid to movement, bullets and sight: walls + closed doors. */
  solid(px: number, py: number): boolean {
    const T = TILE, lvl = this.lvl;
    const tx = Math.floor(px / T), ty = Math.floor(py / T);
    if (tx < 0 || ty < 0 || tx >= lvl.W || ty >= lvl.H) return true;
    if (lvl.grid[ty][tx] === 1) return true;
    const door = this.doorMap.get(tx + ',' + ty);
    return !!door && !door.state.open;
  }

  private circleWall(x: number, y: number, r: number): boolean {
    for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]])
      if (this.solid(x + ox, y + oy)) return true;
    return false;
  }

  moveEntity(ent: Body, dx: number, dy: number): void {
    const nx = ent.x + dx;
    if (!this.circleWall(nx, ent.y, ent.r)) ent.x = nx;
    const ny = ent.y + dy;
    if (!this.circleWall(ent.x, ny, ent.r)) ent.y = ny;
    if (dx || dy) { ent.moving = true; ent.moveAng = Math.atan2(dy, dx); }
  }

  lineClear(x1: number, y1: number, x2: number, y2: number): boolean {
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 12);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.solid(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
    }
    return true;
  }

  /** Closed door directly ahead of a moving body, if any. */
  private doorAhead(ent: Body, ang: number, reach: number): Door | null {
    const px = ent.x + Math.cos(ang) * (ent.r + reach);
    const py = ent.y + Math.sin(ang) * (ent.r + reach);
    const door = this.doorMap.get(Math.floor(px / TILE) + ',' + Math.floor(py / TILE));
    return door && !door.state.open && door.state.busy <= 0 ? door : null;
  }

  // ================= main loop =================
  update(_time: number, delta: number): void {
    let raw = delta / 1000;
    if (raw > 0.05) raw = 0.05;
    this.time2 += raw;

    // slow-mo easing
    if (this.slowT > 0) { this.slowT -= raw; this.ts += (0.28 - this.ts) * Math.min(1, raw * 22); }
    else this.ts += (1 - this.ts) * Math.min(1, raw * 5);
    this.tweens.timeScale = this.ts;
    const dt = raw * this.ts;

    if (!this.over && this.player.alive) this.simulate(dt);
    this.updateCosmetics(dt, raw);
    this.render(raw);
  }

  private simulate(dt: number): void {
    const p = this.player;

    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    for (const d of this.doors) if (d.state.busy > 0) d.state.busy -= dt;

    this.updatePlayer(dt);
    this.updateBullets(dt);
    this.updateThrowables(dt);
    if (!p.alive) return;

    let alive = 0;
    for (const e of this.enemies) if (e.alive) { alive++; this.updateEnemy(e, dt); }
    if (!p.alive) return;

    if (alive === 0 && !this.cleared) {
      this.cleared = true;
      this.exitText.setVisible(true);
      this.cameras.main.flash(350, 0, 229, 255);
    }
    this.exitPulse += dt;

    if (this.cleared) {
      const T = TILE;
      const ex = this.lvl.exit.tx * T + T / 2, ey = this.lvl.exit.ty * T + T / 2;
      if (Math.hypot(p.x - ex, p.y - ey) < 26) {
        this.over = true;
        this.game.events.emit('dd-exit', this.score);
      }
    }
  }

  // ================= player =================
  private updatePlayer(dt: number): void {
    const p = this.player;
    const ptr = this.input.activePointer;
    p.ang = Math.atan2(ptr.worldY - p.y, ptr.worldX - p.x);

    let mx = 0, my = 0;
    if (this.keysObj.W.isDown) my -= 1;
    if (this.keysObj.S.isDown) my += 1;
    if (this.keysObj.A.isDown) mx -= 1;
    if (this.keysObj.D.isDown) mx += 1;
    const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;

    p.dashCd -= dt; p.inv -= dt; p.atkT -= dt;
    p.parryCd -= dt; p.parryT -= dt; p.parryFx -= dt;
    if (p.dashT > 0) p.dashT -= dt;
    if (p.swing > 0) p.swing -= dt;

    // dodge roll
    if (this.dashTap) {
      this.dashTap = false;
      if (p.dashCd <= 0) {
        let ax = mx, ay = my;
        if (!mx && !my) { ax = Math.cos(p.ang); ay = Math.sin(p.ang); }
        p.dashDX = ax; p.dashDY = ay;
        p.dashT = PLAYER.dashTime;
        p.dashCd = PLAYER.dashCd;
        p.inv = PLAYER.dashInv;
        this.playerRig.playRoll(PLAYER.dashTime + 0.06);
        audio.sfx('dash');
        this.shake(4, 0.1);
      }
    }

    // parry
    if (this.parryTap) {
      this.parryTap = false;
      if (p.parryCd <= 0) {
        p.parryT = PLAYER.parryWindow;
        p.parryCd = PLAYER.parryCd;
        audio.sfx('parrySwing');
      }
    }

    p.moving = false;
    if (p.dashT > 0) {
      // dashing into a closed door KICKS it open
      const door = this.doorAhead(p, Math.atan2(p.dashDY, p.dashDX), 10);
      if (door) this.kickDoor(door);
      this.moveEntity(p, p.dashDX * PLAYER.dashSpeed * dt, p.dashDY * PLAYER.dashSpeed * dt);
      this.trail.push({ x: p.x, y: p.y, ang: p.ang, life: 0.22, max: 0.22 });
      p.wphase += dt * 20;
    } else if (mx || my) {
      // walking into a closed door pushes it open
      const door = this.doorAhead(p, Math.atan2(my, mx), 6);
      if (door) { door.open(false); audio.sfx('doorOpen'); }
      this.moveEntity(p, mx * PLAYER.speed * dt, my * PLAYER.speed * dt);
      p.wphase += dt * 11;
    }

    if (this.pickTap) {
      this.pickTap = false;
      if (!this.tryPickup()) this.throwWeapon();
    }

    const wdef = WEAPONS[p.weapon];
    if (wdef.kind === 'gun') {
      if (this.mouseDown && p.atkT <= 0) this.fireGun();
    } else if (this.attackTap && p.atkT <= 0) {
      this.meleeAttack();
    }
    this.attackTap = false;
  }

  // ================= doors =================
  kickDoor(door: Door): void {
    door.open(true);
    audio.sfx('kick');
    this.shake(8, 0.15);
    this.playerRig.playKick(Math.atan2(door.cy - this.player.y, door.cx - this.player.x));
    // anyone close behind the door gets staggered
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - door.cx, e.y - door.cy) < KICK_RADIUS) {
        e.stun = STAGGER_TIME;
        e.aware = true;
        e.windup = 0;
        this.score += KICK_SCORE;
        audio.sfx('stagger');
        this.slowmo(0.18);
      }
    }
  }

  // ================= combat =================
  updateBullets(dt: number): void {
    const p = this.player;
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || this.solid(b.x, b.y)) {
        b.dead = true;
        this.spawnSpark(b.x, b.y, b.friendly ? 0xff2d95 : 0x00e5ff);
        continue;
      }
      if (b.friendly) {
        for (const e of this.enemies) {
          if (e.alive && Math.hypot(e.x - b.x, e.y - b.y) < e.r + 3) {
            this.damageEnemy(e, b.dmg || 1, b.vx, b.vy);
            b.dead = true;
            break;
          }
        }
      } else {
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (p.alive && p.parryT > 0 && d < PLAYER.parryRadius) {
          this.deflectBullet(b);
          continue;
        }
        if (p.alive && p.inv <= 0 && d < p.r + 3) {
          b.dead = true;
          this.killPlayer();
        }
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  deflectBullet(b: BulletState): void {
    const p = this.player;
    let tgt: EnemyState | null = null, td = 1e9;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if (d < td) { td = d; tgt = e; }
    }
    const sp = Math.hypot(b.vx, b.vy) * 1.15;
    const a = tgt ? Math.atan2(tgt.y - b.y, tgt.x - b.x) : Math.atan2(b.y - p.y, b.x - p.x);
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    b.friendly = true; b.life = 1.2; b.dmg = 1;
    p.parryFx = 0.3;
    this.score += PARRY_SCORE;
    audio.sfx('parry');
    this.slowmo(0.22);
    this.shake(3, 0.08);
    this.spawnSpark(b.x, b.y, 0x00e5ff);
  }

  updateThrowables(dt: number): void {
    for (const tw of this.throwables) {
      const st = tw.st;
      st.x += st.vx * dt; st.y += st.vy * dt; st.spin += dt * 22; st.life -= dt;
      let stop = false;
      if (this.solid(st.x, st.y)) stop = true;
      for (const e of this.enemies) {
        if (e.alive && Math.hypot(e.x - st.x, e.y - st.y) < e.r + 6) {
          this.damageEnemy(e, 2, st.vx, st.vy);
          if (e.alive) { e.stun = STAGGER_TIME; audio.sfx('stagger'); }
          stop = true;
          break;
        }
      }
      if (stop || st.life <= 0) {
        st.x = Math.max(16, Math.min(this.lvl.worldW - 16, st.x));
        st.y = Math.max(16, Math.min(this.lvl.worldH - 16, st.y));
        tw.spr.destroy();
        this.spawnPickup(st.w, st.x, st.y);
        st.dead = true;
      } else {
        tw.spr.setPosition(st.x, st.y).setRotation(st.spin);
      }
    }
    this.throwables = this.throwables.filter(t => !t.st.dead);
  }

  tryPickup(): boolean {
    const p = this.player;
    let best: PickupActor | null = null, bd = 40;
    for (const pk of this.pickups) {
      const d = Math.hypot(pk.st.x - p.x, pk.st.y - p.y);
      if (d < bd) { bd = d; best = pk; }
    }
    if (!best) return false;
    if (p.weapon !== 'fists') this.spawnPickup(p.weapon, p.x, p.y);
    p.weapon = best.st.w;
    p.ammo = WEAPONS[best.st.w].ammo ?? 0;
    best.spr.destroy(); best.glow.destroy();
    this.pickups = this.pickups.filter(x => x !== best);
    this.playerRig.playPickup();
    this.playerRig.setWeapon(p.weapon);
    audio.sfx('pickup');
    return true;
  }

  throwWeapon(): void {
    const p = this.player;
    if (p.weapon === 'fists') return;
    const wdef = WEAPONS[p.weapon];
    const sp = wdef.throwSpeed ?? 760;
    const st: ThrowableState = {
      x: p.x + Math.cos(p.ang) * 14, y: p.y + Math.sin(p.ang) * 14,
      vx: Math.cos(p.ang) * sp, vy: Math.sin(p.ang) * sp,
      w: p.weapon, spin: 0, life: 1.2,
    };
    const spr = this.add.image(st.x, st.y, 'wpn-' + st.w).setDepth(6).setScale(0.25);
    this.throwables.push({ st, spr });
    p.weapon = 'fists'; p.ammo = 0;
    this.playerRig.playThrow();
    this.playerRig.setWeapon('fists');
    audio.sfx('throw');
    this.shake(3, 0.08);
  }

  meleeAttack(): void {
    const p = this.player;
    const w = WEAPONS[p.weapon];
    p.atkT = w.cd; p.swing = 0.16;
    this.playerRig.playSwing(0.18);
    audio.sfx('punch');
    let hit = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < (w.range ?? 38) + e.r) {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        const da = Math.abs(((a - p.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (da < (w.arc ?? 1.5) / 2) {
          this.damageEnemy(e, w.dmg, Math.cos(p.ang) * 400, Math.sin(p.ang) * 400);
          hit = true;
        }
      }
    }
    // swinging at a closed door kicks it open too
    const door = this.doorAhead(p, p.ang, (w.range ?? 38) * 0.6);
    if (door) this.kickDoor(door);
    if (hit) this.shake(6, 0.12);
  }

  fireGun(): void {
    const p = this.player;
    const w = WEAPONS[p.weapon];
    if (p.ammo <= 0) { audio.sfx('click'); p.atkT = 0.2; return; }
    p.atkT = w.cd; p.ammo--;
    for (let i = 0; i < (w.pellets ?? 1); i++) {
      const a = p.ang + (Math.random() - 0.5) * (w.spread ?? 0) * ((w.pellets ?? 1) > 1 ? 2 : 1);
      this.bullets.push({
        x: p.x + Math.cos(p.ang) * 14, y: p.y + Math.sin(p.ang) * 14,
        vx: Math.cos(a) * (w.speed ?? 900), vy: Math.sin(a) * (w.speed ?? 900),
        life: 1.1, friendly: true, dmg: w.dmg,
      });
    }
    this.flashes.push({ x: p.x + Math.cos(p.ang) * 22, y: p.y + Math.sin(p.ang) * 22, t: 0.06, ttl: 0.06 });
    this.alertNoise(p.x, p.y);
    this.shake(w.name === 'SHOTGUN' ? 9 : 5, 0.12);
    audio.sfx(w.name === 'SHOTGUN' ? 'shotgun' : 'shoot');
  }

  // ================= enemies =================
  updateEnemy(e: EnemyState, dt: number): void {
    const p = this.player;
    const def = ENEMY_TYPES[e.type];
    e.hitFlash -= dt;
    e.alertT -= dt;
    e.moving = false;
    e.wphase += dt * 10;

    if (e.stun > 0) { e.stun -= dt; return; }

    const dToP = Math.hypot(p.x - e.x, p.y - e.y);
    const los = dToP < def.sight && this.lineClear(e.x, e.y, p.x, p.y);
    if (los && !e.aware) {
      e.aware = true; e.alertT = 0.6;
      e.react = def.react ?? 0.24;
      audio.sfx('alert');
    }
    if (los) e.lastSeen = { x: p.x, y: p.y };

    if (!e.aware) {
      e.patrolT -= dt;
      if (e.patrolT <= 0) {
        e.patrolT = 1 + Math.random() * 1.5;
        const a = Math.random() * 6.28;
        e.pvx = Math.cos(a); e.pvy = Math.sin(a); e.ang = a;
      }
      this.moveEntity(e, e.pvx * def.patrolSpeed * dt, e.pvy * def.patrolSpeed * dt);
      return;
    }

    const tgt = los ? p : (e.lastSeen ?? p);
    const ang = Math.atan2(tgt.y - e.y, tgt.x - e.x);
    e.ang = ang;
    e.atkCd -= dt;

    // aware enemies push doors open (never kick — that's your move)
    const door = this.doorAhead(e, ang, 6);
    if (door) { door.open(false); audio.sfx('doorOpen'); }

    const ranged = def.behavior === 'ranged' && !e.rush;
    if (ranged) {
      e.react -= dt; e.cd -= dt;
      const range = def.range ?? 230;
      if (dToP > range + 30) this.moveEntity(e, Math.cos(ang) * def.speed * dt, Math.sin(ang) * def.speed * dt);
      else if (dToP < range - 60) this.moveEntity(e, -Math.cos(ang) * def.speed * 0.8 * dt, -Math.sin(ang) * def.speed * 0.8 * dt);
      if (los && e.react <= 0 && e.cd <= 0 && e.ammo > 0) {
        this.enemyShoot(e, ang);
        e.cd = def.fireCd ?? 0.6;
        e.ammo--;
        if (e.ammo <= 0) e.rush = true;
      }
      return;
    }

    // melee: chase, then telegraphed windup strike (parryable)
    if (e.windup > 0) {
      e.windup -= dt;
      this.moveEntity(e, Math.cos(ang) * def.speed * 0.25 * dt, Math.sin(ang) * def.speed * 0.25 * dt);
      if (e.windup <= 0) this.resolveMeleeStrike(e);
      return;
    }
    if (dToP > 40) this.moveEntity(e, Math.cos(ang) * def.speed * dt, Math.sin(ang) * def.speed * dt);
    if (dToP < 46 && e.atkCd <= 0) {
      e.windup = def.windup;
      audio.sfx('windup');
    }
  }

  resolveMeleeStrike(e: EnemyState): void {
    const p = this.player;
    e.atkCd = 0.9;
    const rig = this.rigs.get(e);
    rig?.playSwing(0.16);
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d > 58) return;
    if (p.parryT > 0) {
      e.stun = STAGGER_TIME;
      p.parryFx = 0.3;
      this.score += PARRY_SCORE;
      audio.sfx('parry');
      audio.sfx('stagger');
      this.slowmo(0.3);
      this.shake(6, 0.12);
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      this.moveEntity(e, Math.cos(a) * 12, Math.sin(a) * 12);
      return;
    }
    if (p.inv <= 0 && d < 52) this.killPlayer();
  }

  enemyShoot(e: EnemyState, ang: number): void {
    const w = WEAPONS[e.weapon];
    const pellets = w.name === 'SHOTGUN' ? 5 : 1;
    for (let i = 0; i < pellets; i++) {
      const a = ang + (Math.random() - 0.5) * (w.name === 'SHOTGUN' ? 0.36 : 0.06);
      this.bullets.push({
        x: e.x + Math.cos(ang) * 12, y: e.y + Math.sin(ang) * 12,
        vx: Math.cos(a) * 620, vy: Math.sin(a) * 620,
        life: 1.4, friendly: false, dmg: 1,
      });
    }
    this.flashes.push({ x: e.x + Math.cos(ang) * 18, y: e.y + Math.sin(ang) * 18, t: 0.05, ttl: 0.05 });
    this.alertNoise(e.x, e.y);
    audio.sfx('eshoot');
  }

  alertNoise(x: number, y: number): void {
    for (const e of this.enemies) {
      if (e.alive && !e.aware && Math.hypot(e.x - x, e.y - y) < GUNSHOT_NOISE) {
        e.aware = true;
        e.alertT = 0.6;
        e.react = (ENEMY_TYPES[e.type].react ?? 0.24) + 0.15;
        e.lastSeen = { x, y };
      }
    }
  }

  damageEnemy(e: EnemyState, dmg: number, kx: number, ky: number): void {
    const executed = e.stun > 0;
    if (executed) dmg = 999;
    e.hp -= dmg;
    if (e.hp <= 0) { this.killEnemy(e, kx, ky, executed); return; }
    e.hitFlash = 0.15;
    e.aware = true;
    const kl = Math.hypot(kx, ky) || 1;
    this.moveEntity(e, kx / kl * 7, ky / kl * 7);
    audio.sfx('armor');
    this.spawnSpark(e.x, e.y, 0xffd23f);
  }

  killEnemy(e: EnemyState, kx: number, ky: number, executed: boolean): void {
    e.alive = false;
    const def = ENEMY_TYPES[e.type];
    const kAng = Math.atan2(ky, kx);

    // the rig becomes the corpse, dropped under the living
    const rig = this.rigs.get(e);
    if (rig) { rig.toCorpse(kAng); rig.setDepth(3); }
    this.stampBlood(e.x, e.y);

    for (let i = 0; i < 14; i++) {
      const a = kAng + (Math.random() - 0.5) * 1.6;
      const sp = 60 + Math.random() * 220;
      this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, c: 0xff164e, r: 1 + Math.random() * 2.5 });
    }
    if (e.weapon && e.weapon !== 'fists') this.spawnPickup(e.weapon, e.x, e.y);

    this.combo += 1;
    this.comboT = COMBO_TIME;
    let pts = def.score * this.combo;
    if (executed) pts *= EXECUTE_BONUS;
    this.score += pts;
    audio.sfx(executed ? 'execute' : (this.combo > 1 ? 'combo' : 'kill'), this.combo);
    this.shake(5, 0.1);
  }

  private stampBlood(x: number, y: number): void {
    // three growing stamps make the pool spread over ~a second
    for (const [delay, rad] of [[0, 8], [350, 13], [800, 17]] as const) {
      this.time.delayedCall(delay, () => {
        if (!this.scene.isActive()) return;
        this.stampG.clear();
        this.stampG.fillStyle(0x780620, 0.45);
        for (let i = 0; i < 3; i++) {
          this.stampG.fillCircle(
            (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, rad * (0.7 + Math.random() * 0.5));
        }
        this.decalRT.draw(this.stampG, x, y);
      });
    }
  }

  killPlayer(): void {
    const p = this.player;
    if (!p.alive) return;
    p.alive = false;
    this.over = true;
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * 6.28, sp = 60 + Math.random() * 260;
      this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, c: 0xff2d95, r: 1 + Math.random() * 3 });
    }
    this.playerRig.toCorpse(p.ang + Math.PI);
    this.playerRig.setDepth(3);
    this.stampBlood(p.x, p.y);
    audio.sfx('death');
    this.shake(16, 0.5);
    this.cameras.main.flash(400, 255, 45, 59);
    this.time.delayedCall(520, () => this.game.events.emit('dd-death', this.score));
  }

  spawnSpark(x: number, y: number, c: number): void {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * 6.28, sp = 40 + Math.random() * 120;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.2, c, r: 1 + Math.random() * 1.5 });
    }
  }

  slowmo(dur: number): void { this.slowT = Math.max(this.slowT, dur); }

  shake(mag: number, t: number): void {
    this.cameras.main.shake(t * 1000, mag * 0.0009);
  }

  // ================= cosmetics & fx =================
  private updateCosmetics(dt: number, raw: number): void {
    // rigs follow sim state
    const p = this.player;
    if (p.alive) {
      this.playerRig.update(dt, {
        x: p.x, y: p.y, aim: p.ang, moveAng: p.moveAng, moving: p.moving,
        phase: p.wphase, inv: p.inv > 0,
      });
      this.playerRig.setWeapon(p.weapon);
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const def = ENEMY_TYPES[e.type];
      this.rigs.get(e)?.update(dt, {
        x: e.x, y: e.y, aim: e.ang, moveAng: e.moveAng, moving: e.moving,
        phase: e.wphase, stun: e.stun, windup: e.windup, windupMax: def.windup,
        hitFlash: e.hitFlash,
      });
    }

    // particles / trails / flashes advance even during death slow-down
    for (const pt of this.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.9; pt.vy *= 0.9; pt.life -= dt; }
    this.particles = this.particles.filter(pt => pt.life > 0);
    for (const tr of this.trail) tr.life -= dt;
    this.trail = this.trail.filter(t => t.life > 0);
    for (const f of this.flashes) f.t -= raw;
    this.flashes = this.flashes.filter(f => f.t > 0);

    // pickups bob + spin
    for (const pk of this.pickups) {
      pk.st.spin += dt * 1.4;
      const bob = Math.sin(this.time2 * 3 + pk.st.x) * 1.5;
      pk.spr.setPosition(pk.st.x, pk.st.y + bob).setRotation(pk.st.spin);
      pk.glow.setPosition(pk.st.x, pk.st.y + bob).setAlpha(0.35 + 0.15 * Math.sin(this.time2 * 4 + pk.st.x));
    }

    // camera look-ahead toward the mouse
    const ptr = this.input.activePointer;
    let lx = (ptr.worldX - p.x) * CAM.lookAhead, ly = (ptr.worldY - p.y) * CAM.lookAhead;
    const ll = Math.hypot(lx, ly);
    if (ll > CAM.lookMax) { lx = lx / ll * CAM.lookMax; ly = ly / ll * CAM.lookMax; }
    this.cameras.main.setFollowOffset(-lx, -ly);
  }

  /** Per-frame drawing: cones under actors, everything else above them. */
  private render(_raw: number): void {
    const g = this.fxG, cg = this.coneG, p = this.player;
    g.clear();
    cg.clear();
    const accent2 = hexNum(this.L.accent2);

    // vision cones of unaware enemies
    cg.fillStyle(accent2, 0.05);
    for (const e of this.enemies) {
      if (!e.alive || e.aware) continue;
      cg.slice(e.x, e.y, 120, e.ang - 0.46, e.ang + 0.46, false);
      cg.fillPath();
    }

    // exit pad
    const T = TILE;
    const ex = this.lvl.exit.tx * T + T / 2, ey = this.lvl.exit.ty * T + T / 2;
    const pul = 0.5 + 0.5 * Math.sin(this.exitPulse * 4);
    g.lineStyle(3, this.cleared ? accent2 : 0x553366, this.cleared ? 0.55 + 0.45 * pul : 0.25);
    g.strokeRect(ex - 14, ey - 14, 28, 28);
    if (this.cleared) g.strokeRect(ex - 8, ey - 8, 16, 16);

    // dash afterimages
    for (const tr of this.trail) {
      g.fillStyle(0xff2d95, Math.max(0, tr.life / tr.max) * 0.35);
      g.fillEllipse(tr.x, tr.y, 18, 20);
    }

    // enemy telegraphs: windup rings, stun stars, alert marks
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const def = ENEMY_TYPES[e.type];
      if (e.windup > 0) {
        const k = 1 - e.windup / def.windup;
        g.lineStyle(2, 0xff2d3b, 0.25 + 0.55 * k);
        g.strokeCircle(e.x, e.y, e.r + 12 - k * 7);
      }
      if (e.stun > 0) {
        g.fillStyle(0xffd23f, 1);
        for (let i = 0; i < 3; i++) {
          const a = this.time2 * 7.5 + i * 2.09;
          g.fillCircle(e.x + Math.cos(a) * 9, e.y - e.r - 7 + Math.sin(a) * 3, 1.6);
        }
      }
      if (e.alertT > 0) {
        g.fillStyle(0xff2d3b, 1);
        g.fillRect(e.x - 1.5, e.y - e.r - 18, 3, 7);
        g.fillRect(e.x - 1.5, e.y - e.r - 9, 3, 3);
      }
    }

    // parry window arc + success ring
    if (p.alive && p.parryT > 0) {
      const a = p.parryT / PLAYER.parryWindow;
      g.lineStyle(3, 0x00e5ff, 0.35 + 0.55 * a);
      g.beginPath();
      g.arc(p.x, p.y, 21, p.ang - 1.15, p.ang + 1.15);
      g.strokePath();
    }
    if (p.parryFx > 0) {
      const t = p.parryFx / 0.3;
      g.lineStyle(2.5, 0xffffff, t);
      g.strokeCircle(p.x, p.y, 22 + (1 - t) * 44);
      g.lineStyle(2, 0x00e5ff, t * 0.6);
      g.strokeCircle(p.x, p.y, 14 + (1 - t) * 60);
    }

    // bullets (bright core + colored glow)
    for (const b of this.bullets) {
      const glow = b.friendly ? 0xff2d95 : 0x00e5ff;
      g.lineStyle(4, glow, 0.25);
      g.lineBetween(b.x, b.y, b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      g.lineStyle(2, b.friendly ? 0xffffff : 0x00e5ff, 1);
      g.lineBetween(b.x, b.y, b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    }

    // muzzle flashes with a light pool
    for (const f of this.flashes) {
      const k = Math.max(0, f.t / f.ttl);
      g.fillStyle(0xfff0b4, 0.5 * k);
      g.fillCircle(f.x, f.y, 26);
      g.fillStyle(0xffffff, 0.8 * k);
      g.fillCircle(f.x, f.y, 8 * k);
    }

    // particles
    for (const pt of this.particles) {
      g.fillStyle(pt.c, Math.max(0, Math.min(1, pt.life * 2)));
      g.fillRect(pt.x - pt.r, pt.y - pt.r, pt.r * 2, pt.r * 2);
    }
  }
}
