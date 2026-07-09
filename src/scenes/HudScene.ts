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
import { padmap } from '../padmap';
import type { PlayScene } from './PlayScene';

const PS2P = "'Press Start 2P', monospace";
const TECH = "'Share Tech Mono', monospace";

const HINT_KB = 'WASD move · CLICK attack · punch downs, stomp finishes · SHIFT dodge · R-CLICK/Q parry (bullets need a weapon) · E pick up/throw · F interact · ESC pause';

/** Built live from the current bindings, so remaps show up immediately. */
const padHint = (): string => {
  const p = (a: Parameters<typeof padmap.primary>[0]) => padmap.primary(a);
  return `LS move · RS aim · ${p('attack')} attack · punch downs, stomp finishes · ` +
    `${p('dodge')} dodge · ${p('parry')} parry (bullets need a weapon) · ` +
    `${p('pickup')} pick up/throw · ${p('interact')} interact · ${p('pause')} pause`;
};

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
      .setText(HINT_KB);
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
    const B = L.boards[play.boardIndex];
    const wdef = WEAPONS[p.weapon];
    this.hintText.setText(play.padActive ? padHint() : HINT_KB);

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

    this.floorText.setColor(B.accent)
      .setText(B.name + '  ' + (play.boardIndex + 1) + '/' + L.boards.length);
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
    // 'reach' boards show their goal the whole time; 'clear' boards show
    // the exit call-out once everyone is down
    this.clearText.setVisible(play.cleared).setColor(B.accent2)
      .setText(B.objective === 'reach'
        ? (B.goal ?? 'REACH THE EXIT')
        : 'BOARD CLEAR — GET TO THE EXIT');
  }
}
