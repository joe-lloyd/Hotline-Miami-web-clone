/**
 * actors/Door.ts — a kickable door.
 *
 * Every `+` tile in a map becomes a Door. Closed doors are solid to
 * movement, bullets AND enemy sight (PlayScene's solid() consults
 * DoorState.open), which turns rooms into real ambush spaces.
 *
 * Two ways through:
 *   - walk into it  -> swings open politely (open(false))
 *   - dash or melee -> KICKED open (open(true)): slams past its hinge with
 *     a bang; PlayScene staggers anyone within KICK_RADIUS behind it.
 *
 * Visually the door is a neon slab hinged at one end of the opening,
 * rotated by a tween; the slab is tinted with the level's secondary
 * accent so doors pop against the wall trim.
 */
import Phaser from 'phaser';
import { TILE } from '../config';
import { makeDoorTexture, RES } from '../textures';
import type { DoorState } from '../types';

export class Door {
  readonly state: DoorState;
  private slab: Phaser.GameObjects.Image;
  private scene: Phaser.Scene;
  /** hinge position in world px */
  readonly hx: number;
  readonly hy: number;
  /** center of the opening in world px */
  readonly cx: number;
  readonly cy: number;

  constructor(scene: Phaser.Scene, state: DoorState, accent2: string) {
    this.scene = scene;
    this.state = state;
    const T = TILE;
    this.cx = state.tx * T + T / 2;
    this.cy = state.ty * T + T / 2;
    // hinge at the left end (horizontal openings) / top end (vertical)
    this.hx = state.o === 'h' ? state.tx * T : this.cx;
    this.hy = state.o === 'h' ? this.cy : state.ty * T;

    this.slab = scene.add.image(this.hx, this.hy, makeDoorTexture(scene, accent2))
      .setOrigin(0.04, 0.5)
      .setScale(1 / RES)
      .setAlpha(0.9);
    this.slab.setRotation(state.o === 'h' ? 0 : Math.PI / 2);
  }

  setDepth(d: number): void { this.slab.setDepth(d); }

  /** Swing open. kicked=true slams it violently (bigger swing, snappy ease). */
  open(kicked: boolean): void {
    if (this.state.open) return;
    this.state.open = true;
    this.state.busy = 0.3;
    const base = this.state.o === 'h' ? 0 : Math.PI / 2;
    const swing = kicked ? 2.1 : 1.65;
    this.scene.tweens.add({
      targets: this.slab,
      rotation: base + swing,
      duration: kicked ? 130 : 320,
      ease: kicked ? 'Back.easeOut' : 'Sine.easeOut',
    });
  }
}
