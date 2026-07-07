/**
 * main.ts — application shell: boot, menu flow and DOM overlays.
 *
 * Boots Phaser (canvas renderer, 960x600 stage inside #frame, scaled to
 * fit the window) after the pixel fonts have loaded, generates the shared
 * textures, and then runs the game's outer state machine:
 *
 *   menu -> briefing -> play -> (dead | clear | win) -> ...
 *
 * All non-gameplay UI (title, briefings, pause, death, floor-clear, win)
 * is plain DOM layered over the canvas — it's crisper than canvas text,
 * free to style with CSS, and accessible to the headless test suite. The
 * PlayScene reports back only through two events: 'dd-death' and
 * 'dd-exit' (both carry the score).
 *
 * A debug handle is exposed at window.DD for the console and the tests.
 */
import Phaser from 'phaser';
import './style.css';
import { VIEW_W, VIEW_H, BEST_KEY } from './config';
import { LEVELS } from './data/levels';
import { audio } from './audio';
import { makeSharedTextures } from './textures';
import { PlayScene } from './scenes/PlayScene';
import { HudScene } from './scenes/HudScene';

type Mode = 'menu' | 'briefing' | 'play' | 'paused' | 'dead' | 'clear' | 'win';

const $ = (id: string) => document.getElementById(id)!;

class Flow {
  mode: Mode = 'menu';
  levelIndex = 0;
  score = 0;
  levelStartScore = 0;
  best = parseInt(localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;

  constructor(private game: Phaser.Game) {
    // deferred: the scene emits these mid-update, and stopping a scene
    // inside its own update tick pulls Phaser's systems out from under it
    game.events.on('dd-death', (score: number) => {
      this.score = score;
      setTimeout(() => this.onDeath(), 0);
    });
    game.events.on('dd-exit', (score: number) => {
      this.score = score;
      setTimeout(() => this.onExit(), 0);
    });
  }

  private overlays: Record<string, HTMLElement> = {
    menu: $('ov-menu'), briefing: $('ov-briefing'), paused: $('ov-pause'),
    dead: $('ov-dead'), clear: $('ov-clear'), win: $('ov-win'),
  };

  show(mode: Mode): void {
    this.mode = mode;
    for (const key of Object.keys(this.overlays)) {
      this.overlays[key].classList.toggle('on', key === mode);
    }
    if (mode === 'menu') $('menu-best').textContent = String(this.best);
    if (mode === 'briefing') {
      const L = LEVELS[this.levelIndex];
      $('brief-chapter').textContent = L.name;
      $('brief-body').innerHTML = L.briefing.map(p => `<p>${p}</p>`).join('');
    }
    if (mode === 'dead') {
      $('dead-score').textContent = String(this.score);
      $('dead-best').textContent = String(this.best);
    }
    if (mode === 'clear') $('clear-score').textContent = String(this.score);
    if (mode === 'win') {
      $('win-score').textContent = String(this.score);
      $('win-best').textContent = String(this.best);
    }
  }

  startRun(): void {
    audio.init();
    this.levelIndex = 0;
    this.score = 0;
    this.show('briefing');
  }

  beginLevel(): void {
    this.levelStartScore = this.score;
    audio.stopMusic();
    audio.startMusic(LEVELS[this.levelIndex].musicRoot);
    const sm = this.game.scene;
    if (sm.isActive('play') || sm.isPaused('play')) sm.stop('play');
    sm.start('play', { levelIndex: this.levelIndex, score: this.score });
    this.show('play');
  }

  retry(): void {
    this.score = this.levelStartScore;
    this.beginLevel();
  }

  nextLevel(): void {
    this.levelIndex++;
    audio.stopMusic();
    this.show('briefing');
  }

  toMenu(): void {
    audio.stopMusic();
    this.game.scene.stop('play');
    this.show('menu');
  }

  pause(): void {
    if (this.mode !== 'play') return;
    this.game.scene.pause('play');
    this.show('paused');
  }

  resume(): void {
    this.game.scene.resume('play');
    this.show('play');
  }

  private onDeath(): void {
    audio.stopMusic();
    this.saveBest();
    this.show('dead');
  }

  private onExit(): void {
    audio.stopMusic();
    this.saveBest();
    this.game.scene.stop('play');
    this.show(this.levelIndex + 1 < LEVELS.length ? 'clear' : 'win');
  }

  private saveBest(): void {
    if (this.score > this.best) {
      this.best = this.score;
      try { localStorage.setItem(BEST_KEY, String(this.best)); } catch { /* private mode */ }
    }
  }
}

/** Boot scene: generates shared textures, launches the HUD, then stops.
 *
 * Must stop itself rather than idle forever: Phaser's InputManager routes
 * every pointer move through each *active* scene's InputPlugin (even ones
 * with zero interactive game objects), and each one overwrites the shared
 * Pointer's worldX/worldY using its own camera as a side effect. A scene
 * left active with the default (unzoomed, unscrolled) camera — as this one
 * would be if it never stopped — clobbers the correct value PlayScene's
 * zoomed/scrolled camera just wrote, corrupting pointer.worldX/worldY (and
 * therefore player aim) permanently.
 */
class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }
  create(): void {
    makeSharedTextures(this);
    this.scene.launch('hud');
    this.scene.stop();
  }
}

async function boot(): Promise<void> {
  // the HUD uses the pixel fonts — make sure they're ready before Phaser measures text
  try {
    await Promise.all([
      document.fonts.load("10px 'Press Start 2P'"),
      document.fonts.load("10px 'Share Tech Mono'"),
    ]);
  } catch { /* offline: fall back to monospace */ }

  const game = new Phaser.Game({
    type: Phaser.AUTO, // WebGL when available; textures are pre-colored so Canvas looks identical
    parent: 'frame',
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#0a0312',
    disableContextMenu: true,
    scene: [BootScene, PlayScene, HudScene],
  });

  const flow = new Flow(game);
  flow.show('menu');

  // ---------------- buttons ----------------
  $('btn-start').addEventListener('click', () => flow.startRun());
  $('btn-begin').addEventListener('click', () => flow.beginLevel());
  $('btn-resume').addEventListener('click', () => flow.resume());
  $('btn-retry-pause').addEventListener('click', () => flow.retry());
  $('btn-quit').addEventListener('click', () => flow.toMenu());
  $('btn-retry').addEventListener('click', () => flow.retry());
  $('btn-menu-dead').addEventListener('click', () => flow.toMenu());
  $('btn-next').addEventListener('click', () => flow.nextLevel());
  $('btn-menu-clear').addEventListener('click', () => flow.toMenu());
  $('btn-again').addEventListener('click', () => flow.startRun());
  $('btn-menu-win').addEventListener('click', () => flow.toMenu());
  // buttons must not keep focus, or Enter/Space would re-click them
  document.querySelectorAll('button').forEach(b => b.addEventListener('click', () => (b as HTMLButtonElement).blur()));

  // ---------------- global keys (menu flow) ----------------
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (flow.mode === 'menu') flow.startRun();
      else if (flow.mode === 'briefing') flow.beginLevel();
      else if (flow.mode === 'dead') flow.retry();
      else if (flow.mode === 'clear') flow.nextLevel();
      else if (flow.mode === 'win') flow.toMenu();
    }
    if (e.key === 'Escape') {
      if (flow.mode === 'play') flow.pause();
      else if (flow.mode === 'paused') flow.resume();
    }
    if (e.key === ' ') e.preventDefault();
  });

  // ---------------- fit the 960x600 stage to the window ----------------
  const frame = $('frame');
  const fit = () => {
    const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    frame.style.transform = `scale(${s})`;
    // the canvas is CSS-scaled by the #frame transform, not resized by
    // Phaser itself — ScaleManager/InputManager cache the canvas's
    // bounding rect, so without this pointer.worldX/Y drift by the scale
    // factor (worse away from 960x600). refresh() re-measures immediately.
    game.scale.refresh();
  };
  window.addEventListener('resize', fit);
  fit();

  // debug / test handle
  (window as any).DD = { game, flow, LEVELS };
}

void boot();
