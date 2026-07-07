/**
 * scenes/HudScene.ts — the in-game heads-up display.
 *
 * Runs as a separate always-on-top Phaser scene with its own (unzoomed)
 * camera, so HUD text stays screen-space while the play camera zooms and
 * shakes underneath. Every frame it reads public state straight off the
 * PlayScene — weapon, ammo, dodge/parry cooldowns, targets left, score,
 * combo — and reflects it. It renders nothing when the play scene isn't
 * running (menus use DOM overlays instead).
 */
import Phaser from 'phaser';
import { VIEW_W, VIEW_H, PLAYER } from '../config';
import { WEAPONS } from '../data/weapons';
import { LEVELS } from '../data/levels';
import type { PlayScene } from './PlayScene';

const PS2P = "'Press Start 2P', monospace";
const TECH = "'Share Tech Mono', monospace";

export class HudScene extends Phaser.Scene {
  private weaponText!: Phaser.GameObjects.Text;
  private ammoText!: Phaser.GameObjects.Text;
  private floorText!: Phaser.GameObjects.Text;
  private targetsText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private clearText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private dodgeLabel!: Phaser.GameObjects.Text;
  private parryLabel!: Phaser.GameObjects.Text;
  private bars!: Phaser.GameObjects.Graphics;

  constructor() { super('hud'); }

  create(): void {
    const t = (x: number, y: number, size: number, color: string, font = PS2P) =>
      this.add.text(x, y, '', { fontFamily: font, fontSize: size + 'px', color });

    this.weaponText = t(18, 20, 10, '#e7c8ff');
    this.ammoText = t(18, 40, 10, '#ffd23f');
    this.dodgeLabel = t(18, 64, 7, '#8a7a9a').setText('DODGE');
    this.parryLabel = t(18, 80, 7, '#8a7a9a').setText('PARRY');
    this.bars = this.add.graphics();

    this.floorText = t(VIEW_W - 18, 18, 8, '#ff2d95').setOrigin(1, 0);
    this.targetsText = t(VIEW_W - 18, 36, 10, '#00e5ff').setOrigin(1, 0);
    this.scoreText = t(VIEW_W - 18, 58, 14, '#ffffff').setOrigin(1, 0);
    this.comboText = t(VIEW_W / 2, 40, 18, '#ff2d95').setOrigin(0.5);
    this.clearText = t(VIEW_W / 2, 84, 11, '#00e5ff').setOrigin(0.5).setText('FLOOR CLEAR — GET TO THE EXIT');
    this.hintText = t(VIEW_W / 2, VIEW_H - 20, 10, 'rgba(231,200,255,.35)', TECH).setOrigin(0.5)
      .setText('WASD move · CLICK attack · punch downs, stomp finishes · SHIFT dodge · R-CLICK/F parry (bullets need a weapon) · E pick up/throw · ESC pause');
  }

  update(): void {
    const play = this.scene.get('play') as PlayScene;
    const running = this.scene.isActive('play') || this.scene.isPaused('play');
    for (const o of [this.weaponText, this.ammoText, this.floorText, this.targetsText,
      this.scoreText, this.comboText, this.clearText, this.hintText,
      this.dodgeLabel, this.parryLabel]) o.setVisible(running);
    this.bars.clear();
    if (!running || !play.player) return;

    const p = play.player;
    const L = LEVELS[play.levelIndex];
    const wdef = WEAPONS[p.weapon];

    this.weaponText.setText(wdef.name);
    if (wdef.kind === 'gun') {
      this.ammoText.setColor(p.ammo > 0 ? '#ffd23f' : '#ff2d3b').setText('AMMO ' + p.ammo);
    } else if (p.weapon !== 'fists') {
      this.ammoText.setColor('#8affc9').setText('[E] THROW');
    } else {
      this.ammoText.setText('');
    }

    // cooldown bars
    this.bars.fillStyle(0xffffff, 0.14);
    this.bars.fillRect(70, 64, 80, 6);
    this.bars.fillRect(70, 80, 80, 6);
    this.bars.fillStyle(0xff2d95, 1);
    this.bars.fillRect(70, 64, 80 * Phaser.Math.Clamp(1 - p.dashCd / PLAYER.dashCd, 0, 1), 6);
    this.bars.fillStyle(0x00e5ff, 1);
    this.bars.fillRect(70, 80, 80 * Phaser.Math.Clamp(1 - p.parryCd / PLAYER.parryCd, 0, 1), 6);

    this.floorText.setColor(L.accent).setText('FLOOR ' + (play.levelIndex + 1) + '/' + LEVELS.length);
    let alive = 0;
    for (const e of play.enemies) if (e.alive) alive++;
    this.targetsText.setText('TARGETS ' + alive);
    this.scoreText.setText(String(play.score).padStart(6, '0'));

    if (play.combo > 1) {
      this.comboText.setVisible(true).setText('x' + play.combo)
        .setScale(1 + Math.min(play.combo, 10) * 0.06);
    } else {
      this.comboText.setVisible(false);
    }
    this.clearText.setVisible(play.cleared).setColor(L.accent2);
  }
}
