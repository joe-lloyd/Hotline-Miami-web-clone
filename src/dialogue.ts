/**
 * dialogue.ts — the visual-novel scene player.
 *
 * Drives the #ov-dialog DOM overlay: full-body character cutouts left
 * and right (active speaker lit, the other dimmed), a name plate, and a
 * typewriter text box. Pure DOM like the rest of the menu flow — the
 * Flow in main.ts owns WHEN scenes play (and the once-per-run rules);
 * this class only plays one scene and calls back when it ends.
 *
 * Input contract (wired in main.ts): advance() on click / Enter / Space /
 * pad-A — finishes the typewriter first, then steps a line; skip() on
 * Esc / START ends the whole scene immediately. Both are safe to call
 * when no scene is active.
 */
import { CHARACTERS, type StoryLine } from './data/story';
import { makePortrait } from './portraits';

const $ = (id: string) => document.getElementById(id)!;

export class DialoguePlayer {
  private lines: StoryLine[] = [];
  private idx = -1;
  private full = '';
  private timer: number | null = null;
  private onDone: (() => void) | null = null;
  private portraits = new Map<string, string>();

  private left = $('dlg-left') as HTMLImageElement;
  private right = $('dlg-right') as HTMLImageElement;
  private box = $('dlg-box');
  private name = $('dlg-name');
  private text = $('dlg-text');
  private next = $('dlg-next');

  play(lines: StoryLine[], done: () => void): void {
    this.lines = lines;
    this.onDone = done;
    this.idx = -1;
    this.left.classList.remove('shown', 'active');
    this.right.classList.remove('shown', 'active');
    this.step();
  }

  /** Click/Enter/A: reveal the rest of the line, or go to the next one. */
  advance(): void {
    if (!this.onDone) return;
    if (this.timer !== null) { this.reveal(); return; }
    this.step();
  }

  /** Esc/START: end the scene now. Safe when nothing is playing. */
  skip(): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    const done = this.onDone;
    this.onDone = null;
    done?.();
  }

  private step(): void {
    this.idx++;
    if (this.idx >= this.lines.length) { this.skip(); return; }
    const line = this.lines[this.idx];
    const ch = CHARACTERS[line.who];

    let url = this.portraits.get(line.who);
    if (!url) { url = makePortrait(ch); this.portraits.set(line.who, url); }
    const img = ch.side === 'left' ? this.left : this.right;
    const other = ch.side === 'left' ? this.right : this.left;
    if (img.src !== url) img.src = url;
    img.classList.add('shown', 'active');
    other.classList.remove('active');

    this.name.textContent = ch.name;
    this.name.style.color = ch.color;
    this.box.style.borderColor = ch.color;
    // lines in (parentheses) are inner monologue
    this.text.classList.toggle('inner', line.text.startsWith('('));

    this.full = line.text;
    this.text.textContent = '';
    this.next.classList.remove('on');
    let shown = 0;
    this.timer = window.setInterval(() => {
      shown += 2;
      if (shown >= this.full.length) { this.reveal(); return; }
      this.text.textContent = this.full.slice(0, shown);
    }, 24);
  }

  private reveal(): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.text.textContent = this.full;
    this.next.classList.add('on');
  }
}
