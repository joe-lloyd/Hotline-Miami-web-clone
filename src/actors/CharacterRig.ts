/**
 * actors/CharacterRig.ts — the articulated character body.
 *
 * A rig is a Phaser Container composed of real parts:
 *
 *   root ─ shadow
 *        ─ feetC (rotates to MOVEMENT direction)
 *        │    legL/legR   thigh segments stretched hip -> foot
 *        │    footL/footR shoes that stride back and forth
 *        └ torsoC (rotates to AIM direction)
 *             armL/armR   sleeve segments stretched shoulder -> hand
 *             weapon      held sprite, follows the gripping hand
 *             handL/handR
 *             torso, head, hit-flash overlay
 *
 * Because limbs are stretched between joints every frame, legs and arms
 * genuinely articulate rather than being baked into one sprite:
 *   - walking: feet stride sinusoidally, legs follow, free hands swing
 *   - actions: playSwing (melee sweep), playPickup (crouch + both hands
 *     reach down), playKick (foot thrust for door kicks), playThrow (arm
 *     whip), playRoll (full-body dodge spin)
 *   - states: windup raises the weapon arm (the parry telegraph), stun
 *     wobbles the torso, hitFlash blinks armored targets white
 *
 * All parts use pre-colored textures from textures.ts (never setTint —
 * that's WebGL-only and the game supports the Canvas renderer). The rig
 * is purely visual: PlayScene owns the simulation and feeds it in via
 * update(dt, RigInput). toCorpse() reposes the same parts into a sprawled
 * body, swapping to the darkened texture variants.
 */
import Phaser from 'phaser';
import type { CharPalette } from '../types';
import { WEAPONS } from '../data/weapons';
import { makeCharTextures, getWeaponTex, RES, type PalKeys } from '../textures';

export interface RigInput {
  x: number; y: number;
  aim: number;
  moveAng: number;
  moving: boolean;
  phase: number;      // walk cycle phase, advanced by the scene
  stun?: number;
  windup?: number;
  windupMax?: number;
  inv?: boolean;      // dodge i-frames -> ghosted alpha
  hitFlash?: number;
  /** out of combat and unarmed: arms hang relaxed at the sides */
  relaxed?: boolean;
}

type ActionType = 'swing' | 'pickup' | 'kick' | 'throw' | 'roll';
interface Action { type: ActionType; t: number; dur: number; ang?: number }

const rot = (x: number, y: number, a: number): [number, number] =>
  [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

export class CharacterRig {
  readonly root: Phaser.GameObjects.Container;
  private feetC: Phaser.GameObjects.Container;
  private torsoC: Phaser.GameObjects.Container;
  private legL: Phaser.GameObjects.Image;
  private legR: Phaser.GameObjects.Image;
  private footL: Phaser.GameObjects.Image;
  private footR: Phaser.GameObjects.Image;
  private armL: Phaser.GameObjects.Image;
  private armR: Phaser.GameObjects.Image;
  private handL: Phaser.GameObjects.Image;
  private handR: Phaser.GameObjects.Image;
  private weaponSpr: Phaser.GameObjects.Image;
  private torso: Phaser.GameObjects.Image;
  private head: Phaser.GameObjects.Image;
  private flash: Phaser.GameObjects.Image;

  private keys: PalKeys;
  private s: number;                 // world scale (r / 11)
  private weapon = 'fists';
  private action: Action | null = null;
  private time = 0;
  private isCorpse = false;
  private isDown = false;    // knocked down (punch) — sprawled but alive
  private stance = 1;        // arm pose blend: 0 relaxed at sides, 1 combat-ready

  /** limb bar thicknesses — the fem build is slimmer */
  private armTh: number;
  private legTh: number;

  constructor(scene: Phaser.Scene, x: number, y: number, pal: CharPalette, r: number) {
    this.s = r / 11;
    this.keys = makeCharTextures(scene, pal);
    this.armTh = pal.fem ? 3.4 : 4.2;
    this.legTh = pal.fem ? 3.0 : 3.6;
    const s = this.s, k = s / RES;
    const keys = this.keys;

    const img = (tex: string) => scene.add.image(0, 0, tex).setScale(k);

    const shadow = scene.add.image(0, 2.5 * s, 'shadow')
      .setScale(k * (pal.fem ? 0.82 : 1), k * (pal.fem ? 0.76 : 1));

    this.legL = img(keys.leg).setOrigin(0, 0.5);
    this.legR = img(keys.leg).setOrigin(0, 0.5);
    this.footL = img(keys.foot);
    this.footR = img(keys.foot);
    this.feetC = scene.add.container(0, 0, [this.legL, this.legR, this.footL, this.footR]);

    this.armL = img(keys.sleeve).setOrigin(0, 0.5);
    this.armR = img(keys.sleeve).setOrigin(0, 0.5);
    this.weaponSpr = img('wpn-pistol').setVisible(false);
    this.handL = img(keys.hand);
    this.handR = img(keys.hand);
    this.torso = img(keys.torso);
    this.head = scene.add.image(0.5 * s, 0, keys.head).setScale(k);
    this.flash = scene.add.image(0, 0, 'dot').setScale(k * 4.2).setAlpha(0); // white blink for armored hits
    this.torsoC = scene.add.container(0, 0, [
      this.armL, this.armR, this.weaponSpr, this.handL, this.handR, this.torso, this.head, this.flash,
    ]);

    this.root = scene.add.container(x, y, [shadow, this.feetC, this.torsoC]);
  }

  setWeapon(w: string): void {
    if (w === this.weapon) return;
    this.weapon = w;
    const tex = getWeaponTex(w);
    this.weaponSpr.setTexture(tex.key).setOrigin(tex.originX, tex.originY).setScale(this.s / RES);
    this.weaponSpr.setVisible(w !== 'fists' && !this.isCorpse);
  }

  // ---------------- action animations ----------------
  private play(type: ActionType, dur: number, ang?: number): void {
    if (this.isCorpse) return;
    this.action = { type, t: 0, dur, ang };
  }
  playSwing(dur = 0.18): void { this.play('swing', dur); }
  playPickup(): void { this.play('pickup', 0.28); }
  playThrow(): void { this.play('throw', 0.16); }
  playKick(worldAng: number): void { this.play('kick', 0.2, worldAng); }
  playRoll(dur: number): void { this.play('roll', dur); }

  // ---------------- per-frame pose ----------------
  update(dt: number, st: RigInput): void {
    if (this.isCorpse) return;
    this.time += dt;
    const s = this.s;

    this.root.setPosition(st.x, st.y);
    if (this.isDown) return; // hold the sprawled knockdown pose
    this.root.setAlpha(st.inv ? 0.6 : 1);

    let prog = 0;
    if (this.action) {
      this.action.t += dt;
      prog = Math.min(1, this.action.t / this.action.dur);
      if (this.action.t >= this.action.dur) this.action = null;
    }
    const act = this.action;

    // dodge roll: spin the whole body
    this.root.setRotation(act?.type === 'roll' ? prog * Math.PI * 2 : 0);

    // ----- feet: movement direction + stride -----
    const kicking = act?.type === 'kick';
    const feetAng = kicking ? (act!.ang ?? st.aim) : (st.moving ? st.moveAng : st.aim);
    this.feetC.setRotation(feetAng - this.root.rotation);
    // big stride so the feet kick out past the torso silhouette — legs
    // must actually read while running
    const stride = st.moving ? Math.sin(st.phase) * 9.5 * s : 0;
    const flx = stride, fly = -5.2 * s;
    let frx = -stride, fry = 5.2 * s;
    if (kicking) {
      // right foot thrusts forward and snaps back
      const k = Math.sin(prog * Math.PI);
      frx = -stride + k * 15 * s;
      fry = 4.5 * s - k * 3 * s;
    }
    this.footL.setPosition(flx, fly);
    this.footR.setPosition(frx, fry);
    this.poseLimb(this.legL, -2 * s, -4.2 * s, flx, fly, this.legTh * s);
    this.poseLimb(this.legR, -2 * s, 4.2 * s, frx, fry, this.legTh * s);

    // ----- torso: aim direction (+ stagger wobble) -----
    let aim = st.aim;
    if ((st.stun ?? 0) > 0) aim += Math.sin(this.time * 16) * 0.22;
    this.torsoC.setRotation(aim - this.root.rotation);

    // crouch for pickups
    const crouch = act?.type === 'pickup' ? 1 - 0.14 * Math.sin(prog * Math.PI) : 1;
    this.torsoC.setScale(crouch);

    // ----- arms + weapon -----
    const isGun = WEAPONS[this.weapon]?.kind === 'gun';

    let armAng = 0;
    if (act?.type === 'swing') armAng = -1.15 + prog * 2.3;
    else if ((st.windup ?? 0) > 0) armAng = -1.05 * Math.min(1, (st.windup ?? 0) / (st.windupMax || 0.4));

    let hlx: number, hly: number, hrx: number, hry: number;
    let wx = 0, wy = 0, wrot = 0;
    const swingArm = st.moving ? Math.sin(st.phase) * 1.8 * s : 0;
    // stance blend: 0 = arms relaxed at the sides, 1 = combat guard.
    // Any action (swing/kick/throw/...) counts as guard immediately.
    this.stance += ((st.relaxed && !act ? 0 : 1) - this.stance) * Math.min(1, dt * 9);

    if (isGun) {
      // two-handed grip, weapon centered forward
      hlx = 10.5 * s; hly = -1.6 * s;
      hrx = 11.5 * s; hry = 1.6 * s;
      wx = 8.5 * s; wy = 0; wrot = 0;
    } else if (this.weapon === 'fists') {
      hlx = 7.5 * s; hly = -6.5 * s + swingArm;
      hrx = 7.5 * s; hry = 6.5 * s - swingArm;
      [hrx, hry] = rot(hrx, hry, armAng); // punches follow the swing
      // relaxed arms hang at her sides and swing naturally with the walk
      const k = 1 - this.stance;
      if (k > 0.001) {
        hlx += (-1.5 * s + swingArm * 1.5 - hlx) * k;
        hly += (-7.8 * s - hly) * k;
        hrx += (-1.5 * s - swingArm * 1.5 - hrx) * k;
        hry += (7.8 * s - hry) * k;
      }
    } else {
      // one-handed melee: right hand grips, weapon sweeps with armAng
      [hrx, hry] = rot(9.5 * s, 4.5 * s, armAng);
      [hlx, hly] = rot(7.5 * s, -6.5 * s + swingArm, armAng * 0.4);
      wx = hrx; wy = hry; wrot = armAng;
    }

    if (act?.type === 'pickup') {
      // both hands reach down front-center
      const k = Math.sin(prog * Math.PI);
      hlx = hlx + (6.5 * s - hlx) * k; hly = hly + (-2 * s - hly) * k;
      hrx = hrx + (6.5 * s - hrx) * k; hry = hry + (2 * s - hry) * k;
      if (!isGun && this.weapon !== 'fists') { wx = hrx; wy = hry; }
    } else if (act?.type === 'throw') {
      const k = Math.sin(prog * Math.PI);
      hrx = hrx + (13.5 * s - hrx) * k; hry = hry + (0.5 * s - hry) * k;
    }

    this.handL.setPosition(hlx, hly);
    this.handR.setPosition(hrx, hry);
    this.poseLimb(this.armL, -1.5 * s, -7 * s, hlx, hly, this.armTh * s);
    this.poseLimb(this.armR, -1.5 * s, 7 * s, hrx, hry, this.armTh * s);
    this.weaponSpr.setPosition(wx, wy).setRotation(wrot);

    // armored hit feedback: white blink overlay (canvas-safe, no tint)
    this.flash.setAlpha((st.hitFlash ?? 0) > 0 ? Math.min(1, (st.hitFlash ?? 0) * 6) : 0);
  }

  /** Stretch a limb segment between a joint and an endpoint. */
  private poseLimb(limb: Phaser.GameObjects.Image, jx: number, jy: number, ex: number, ey: number, thick: number): void {
    limb.setPosition(jx, jy);
    const d = Math.max(2, Math.hypot(ex - jx, ey - jy));
    limb.setRotation(Math.atan2(ey - jy, ex - jx));
    limb.setDisplaySize(d, thick);
  }

  /**
   * Knocked down by a punch: sprawl the body (normal textures — they're
   * alive) and freeze the pose until standUp(). Reversible, unlike toCorpse.
   */
  knockdown(ang: number): void {
    if (this.isCorpse || this.isDown) return;
    this.isDown = true;
    this.action = null;
    const s = this.s;
    this.root.setRotation(ang + (Math.random() - 0.5) * 0.6);
    this.feetC.setRotation(0);
    this.torsoC.setRotation(0);
    this.torsoC.setScale(1);
    this.weaponSpr.setVisible(false);
    this.flash.setAlpha(0);
    this.footL.setPosition(-12 * s, 7 * s);
    this.footR.setPosition(-13 * s, -4 * s);
    this.poseLimb(this.legL, -3 * s, 3 * s, -12 * s, 7 * s, this.legTh * s);
    this.poseLimb(this.legR, -3 * s, -3 * s, -13 * s, -4 * s, this.legTh * s);
    // arms bracing, trying to push back up
    this.handL.setPosition(7 * s, -9 * s);
    this.handR.setPosition(8 * s, 8 * s);
    this.poseLimb(this.armL, 2 * s, -5 * s, 7 * s, -9 * s, this.armTh * s);
    this.poseLimb(this.armR, 2 * s, 5 * s, 8 * s, 8 * s, this.armTh * s);
    this.head.setPosition(7 * s, 1 * s);
  }

  /** Back on their feet: resume normal per-frame posing. */
  standUp(): void {
    if (this.isCorpse || !this.isDown) return;
    this.isDown = false;
    this.root.setRotation(0);
    this.head.setPosition(0.5 * this.s, 0);
    this.weaponSpr.setVisible(this.weapon !== 'fists');
  }

  /** Repose the same parts into a sprawled corpse. Rig stops animating. */
  toCorpse(killAng: number): void {
    if (this.isCorpse) return;
    this.isCorpse = true;
    this.isDown = false;
    this.action = null;
    const s = this.s;
    this.root.setRotation(killAng + (Math.random() - 0.5) * 0.8);
    this.root.setAlpha(0.95);
    this.feetC.setRotation(0);
    this.torsoC.setRotation(0);
    this.torsoC.setScale(1);
    this.weaponSpr.setVisible(false);
    this.flash.setAlpha(0);

    // swap to the darkened texture variants
    this.torso.setTexture(this.keys.torsoDark);
    this.head.setTexture(this.keys.headDark);
    this.footL.setTexture(this.keys.footDark);
    this.footR.setTexture(this.keys.footDark);

    // splayed legs
    this.footL.setPosition(-13 * s, 8 * s);
    this.footR.setPosition(-14 * s, -5 * s);
    this.poseLimb(this.legL, -3 * s, 3 * s, -13 * s, 8 * s, this.legTh * s);
    this.poseLimb(this.legR, -3 * s, -3 * s, -14 * s, -5 * s, this.legTh * s);
    // arms flung out
    this.handL.setPosition(9 * s, -12 * s);
    this.handR.setPosition(11 * s, 9 * s);
    this.poseLimb(this.armL, 2 * s, -5 * s, 9 * s, -12 * s, this.armTh * s);
    this.poseLimb(this.armR, 2 * s, 5 * s, 11 * s, 9 * s, this.armTh * s);
    // head flung forward
    this.head.setPosition(8.5 * s, 1.5 * s);
  }

  setDepth(d: number): void { this.root.setDepth(d); }
  destroy(): void { this.root.destroy(); }
}
