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
import { SCENES } from './data/story';
import { DialoguePlayer } from './dialogue';
import { padmap, PAD_ACTIONS, type PadAction } from './padmap';
import { audio } from './audio';
import { makeSharedTextures } from './textures';
import { PlayScene } from './scenes/PlayScene';
import { HudScene } from './scenes/HudScene';

type Mode = 'menu' | 'dialog' | 'briefing' | 'play' | 'paused' | 'dead' | 'clear' | 'win' | 'remap';

const $ = (id: string) => document.getElementById(id)!;

class Flow {
  mode: Mode = 'menu';
  levelIndex = 0;
  boardIndex = 0;
  score = 0;
  boardStartScore = 0;
  best = parseInt(localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  /** story scenes already played this run — dying/retrying never replays */
  private seen = new Set<string>();
  private story = new DialoguePlayer();

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
    menu: $('ov-menu'), dialog: $('ov-dialog'), briefing: $('ov-briefing'),
    paused: $('ov-pause'), dead: $('ov-dead'), clear: $('ov-clear'), win: $('ov-win'),
    remap: $('ov-remap'),
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
    if (mode === 'clear') {
      $('clear-score').textContent = String(this.score);
      const copy = LEVELS[this.levelIndex].clearCopy;
      if (copy) $('clear-copy').innerHTML = copy;
    }
    if (mode === 'win') {
      $('win-score').textContent = String(this.score);
      $('win-best').textContent = String(this.best);
    }
  }

  startRun(): void {
    audio.init();
    this.levelIndex = 0;
    this.boardIndex = 0;
    this.score = 0;
    this.seen.clear();
    this.enterLevel();
  }

  /** Level intro scene (once per run), then the briefing. */
  enterLevel(): void {
    this.playStory(LEVELS[this.levelIndex].intro, () => this.show('briefing'));
  }

  /** Board intro scene (once per run — never on retry), then the board. */
  startBoard(): void {
    const B = LEVELS[this.levelIndex].boards[this.boardIndex];
    this.playStory(B.intro, () => this.beginBoard());
  }

  beginBoard(): void {
    this.boardStartScore = this.score;
    const B = LEVELS[this.levelIndex].boards[this.boardIndex];
    // per-level Strudel track, transposed to the board's bass root
    audio.playTrack(this.levelIndex, B.musicRoot);
    const sm = this.game.scene;
    if (sm.isActive('play') || sm.isPaused('play')) sm.stop('play');
    sm.start('play', { levelIndex: this.levelIndex, boardIndex: this.boardIndex, score: this.score });
    this.show('play');
  }

  retry(): void {
    this.score = this.boardStartScore;
    this.beginBoard();
  }

  nextLevel(): void {
    this.levelIndex++;
    this.boardIndex = 0;
    audio.stopTrack();
    this.enterLevel();
  }

  /** Play a story scene by id — at most once per run; no-op if unknown. */
  playStory(id: string | undefined, done: () => void): void {
    if (!id || this.seen.has(id) || !SCENES[id]) { done(); return; }
    this.seen.add(id);
    this.show('dialog');
    this.story.play(SCENES[id], done);
  }

  advanceStory(): void { this.story.advance(); }
  skipStory(): void { this.story.skip(); }

  // ---- controller remap overlay (opens from menu OR pause; returns) ----
  private remapReturn: Mode = 'menu';
  openRemap(): void {
    this.remapReturn = this.mode === 'paused' ? 'paused' : 'menu';
    this.show('remap');
  }
  closeRemap(): void { this.show(this.remapReturn); }

  toMenu(): void {
    audio.stopTrack();
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
    audio.stopTrack();
    this.saveBest();
    this.show('dead');
  }

  private onExit(): void {
    audio.stopTrack();
    this.saveBest();
    this.game.scene.stop('play');
    const L = LEVELS[this.levelIndex];
    if (this.boardIndex + 1 < L.boards.length) {
      // next board of the same level — seamless, via its interlude scene
      this.boardIndex++;
      this.startBoard();
    } else if (this.levelIndex + 1 < LEVELS.length) {
      this.show('clear');
    } else {
      // campaign done: the ending scene, then the win screen
      this.playStory(L.outro, () => this.show('win'));
    }
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
    input: { gamepad: true },
    scene: [BootScene, PlayScene, HudScene],
  });

  const flow = new Flow(game);
  flow.show('menu');

  // ---------------- buttons ----------------
  $('btn-start').addEventListener('click', () => flow.startRun());
  $('btn-begin').addEventListener('click', () => flow.startBoard());
  $('ov-dialog').addEventListener('click', () => flow.advanceStory());

  // ---------------- controller remap menu ----------------
  let awaiting: PadAction | null = null;     // row waiting for a button press
  const remapList = $('remap-list');
  const renderRemap = () => {
    remapList.innerHTML = '';
    for (const a of PAD_ACTIONS) {
      const row = document.createElement('div');
      row.className = 'remap-row' + (awaiting === a.id ? ' waiting' : '');
      const label = document.createElement('span');
      label.className = 'remap-label';
      label.textContent = a.label;
      const val = document.createElement('span');
      val.className = 'remap-val';
      val.textContent = awaiting === a.id ? 'PRESS A BUTTON…' : padmap.name(a.id);
      row.append(label, val);
      row.addEventListener('click', () => {
        awaiting = awaiting === a.id ? null : a.id;
        renderRemap();
      });
      remapList.appendChild(row);
    }
  };
  const openRemap = () => { awaiting = null; renderRemap(); flow.openRemap(); };
  $('btn-remap').addEventListener('click', openRemap);
  $('btn-remap-pause').addEventListener('click', openRemap);
  $('btn-remap-reset').addEventListener('click', () => { padmap.reset(); awaiting = null; renderRemap(); });
  $('btn-remap-done').addEventListener('click', () => flow.closeRemap());
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
  /** ENTER / pad-A: the primary action of whatever overlay is up. */
  const advance = () => {
    if (flow.mode === 'dialog') flow.advanceStory();
    else if (flow.mode === 'menu') flow.startRun();
    else if (flow.mode === 'briefing') flow.startBoard();
    else if (flow.mode === 'dead') flow.retry();
    else if (flow.mode === 'clear') flow.nextLevel();
    else if (flow.mode === 'win') flow.toMenu();
  };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') advance();
    if (e.key === 'Escape') {
      if (flow.mode === 'play') flow.pause();
      else if (flow.mode === 'paused') flow.resume();
      else if (flow.mode === 'dialog') flow.skipStory();
      else if (flow.mode === 'remap') flow.closeRemap();
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (flow.mode === 'dialog') flow.advanceStory();
    }
  });

  // ---------------- gamepad (menu flow, pause, remapping) ----------------
  // PlayScene reads the pad for gameplay; this raw-API loop drives the DOM
  // overlays instead, so it keeps working while the play scene is paused.
  // A (hardwired, UI convention) confirms menus; the remappable 'pause'
  // action pauses/resumes; in the remap overlay ANY pressed button binds
  // the awaiting action.
  let padWas: boolean[] = [];
  const padPoll = () => {
    const pad = navigator.getGamepads
      ? Array.from(navigator.getGamepads()).find(g => g && g.connected)
      : null;
    if (pad) {
      const now = pad.buttons.map(b => (b?.value ?? 0) > 0.5);
      const edge = (i: number) => now[i] && !padWas[i];
      if (flow.mode === 'remap') {
        if (awaiting !== null) {
          const idx = now.findIndex((v, i) => v && !padWas[i]);
          if (idx >= 0) {
            padmap.rebind(awaiting, idx);
            awaiting = null;
            renderRemap();
          }
        }
      } else {
        if (edge(0) && flow.mode !== 'play' && flow.mode !== 'paused') advance();
        if (padmap.map.pause.some(edge)) {
          if (flow.mode === 'play') flow.pause();
          else if (flow.mode === 'paused') flow.resume();
          else if (flow.mode === 'dialog') flow.skipStory();
          else advance();
        }
      }
      padWas = now;
    }
    requestAnimationFrame(padPoll);
  };
  requestAnimationFrame(padPoll);

  // Gamepad presses don't count as a user gesture for WebAudio — if the
  // run was started from the pad, the AudioContext is stuck suspended
  // until a real click or keypress comes along to unlock it.
  const unlockAudio = () => { if (flow.mode !== 'menu') audio.init(); };
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

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
  (window as any).DD = { game, flow, LEVELS, padmap, audio };
}

void boot();
