/**
 * test/smoke.test.mjs — boots the real game page in headless Chrome and
 * plays it the way a user would: menu button -> briefing -> level start,
 * then raw keyboard/mouse input (move, dodge, attack, parry, pickup,
 * throw, pause). Fails on any page error or console error, and captures
 * screenshots into test/out/ for eyeballing.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:4173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--autoplay-policy=no-user-gesture-required'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#ov-menu.on');
  await page.screenshot({ path: path.join(OUT, 'smoke-1-menu.png') });
  console.log('menu ok');

  await page.click('#btn-start');
  await page.waitForSelector('#ov-briefing.on');
  console.log('briefing ok');

  await page.click('#btn-begin');
  await sleep(600);
  const playing = await page.evaluate(() =>
    !document.querySelector('#ov-briefing').classList.contains('on') &&
    window.DD?.game?.scene?.isActive('play'));
  if (!playing) throw new Error('play scene did not start');
  await page.screenshot({ path: path.join(OUT, 'smoke-2-play.png') });
  console.log('play started');

  const box = await page.evaluate(() => {
    const r = document.querySelector('#frame canvas').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;

  // --- mouse-aim regression: pointer.worldX/Y must match Phaser's own
  // camera math at the CSS-scaled canvas coordinates, at any window size
  // (viewport here is 1280x800 vs. the 960x600 stage, so scale != 1 and a
  // stale ScaleManager/InputManager bounds cache would show up as an offset).
  // pointer.worldX/Y is only recomputed on an actual DOM pointer event, but
  // the play camera's mouse look-ahead keeps lerping scroll for a few frames
  // after that event — so settle first, then re-move to the same spot to
  // refresh the pointer against the now-stable camera before comparing.
  const aimClientX = box.x + box.w * 0.73, aimClientY = box.y + box.h * 0.22;
  await page.mouse.move(aimClientX, aimClientY);
  await sleep(500);
  await page.mouse.move(aimClientX, aimClientY);
  await sleep(20);
  const aim = await page.evaluate(({ clientX, clientY }) => {
    const rect = document.querySelector('#frame canvas').getBoundingClientRect();
    const S = window.DD.game.scene.getScene('play');
    const cam = S.cameras.main;
    const canvasX = (clientX - rect.left) * (960 / rect.width);
    const canvasY = (clientY - rect.top) * (600 / rect.height);
    const wp = cam.getWorldPoint(canvasX, canvasY);
    const ptr = S.input.activePointer;
    return { expX: wp.x, expY: wp.y, gotX: ptr.worldX, gotY: ptr.worldY };
  }, { clientX: aimClientX, clientY: aimClientY });
  const dx = Math.abs(aim.gotX - aim.expX), dy = Math.abs(aim.gotY - aim.expY);
  if (dx >= 2 || dy >= 2) {
    throw new Error(
      `mouse-aim mismatch: pointer.worldX/Y (${aim.gotX.toFixed(1)}, ${aim.gotY.toFixed(1)}) ` +
      `!= expected camera world point (${aim.expX.toFixed(1)}, ${aim.expY.toFixed(1)}), ` +
      `delta (${dx.toFixed(1)}, ${dy.toFixed(1)})`);
  }
  console.log('mouse-aim mapping ok', aim);

  await page.mouse.move(cx + 200, cy);
  await page.keyboard.down('d');
  await sleep(600);
  await page.keyboard.down('s');
  await sleep(400);
  await page.keyboard.up('d');
  await page.keyboard.press('Shift');       // dodge roll
  await sleep(300);
  await page.mouse.click(cx + 150, cy + 60); // punch
  await sleep(200);
  await page.keyboard.press('f');           // parry
  await sleep(250);
  await page.mouse.click(cx + 100, cy, { button: 'right' });
  await page.keyboard.press('e');           // contextual pickup/throw attempt
  await sleep(150);
  await page.keyboard.press('q');           // parry via Q
  await sleep(700);
  await page.keyboard.up('s');
  await page.screenshot({ path: path.join(OUT, 'smoke-3-action.png') });
  console.log('gameplay input ok');

  await page.keyboard.press('Escape');
  await sleep(250);
  const paused = await page.evaluate(() => document.querySelector('#ov-pause').classList.contains('on'));
  if (!paused) throw new Error('pause overlay missing');
  await page.keyboard.press('Escape');
  console.log('pause ok');

  await sleep(2500); // let AI/render run to shake out errors
  await page.screenshot({ path: path.join(OUT, 'smoke-4-late.png') });

  if (errors.length) throw new Error('PAGE ERRORS:\n' + errors.join('\n'));
  console.log('SMOKE PASS — no page errors');
} finally {
  await browser.close();
}
