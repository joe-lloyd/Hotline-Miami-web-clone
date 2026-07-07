/**
 * test/mechanics.test.mjs — end-to-end verification of the combat rules,
 * driven through the window.DD debug handle (flow + Phaser game). The
 * PlayScene keeps its simulation in plain public state, so the test can
 * teleport enemies, inject bullets and step subsystems deterministically.
 *
 * Covers: gun kills + drops + score, bullet parry (deflect/slow-mo/score),
 * unparried deaths, melee windup parry -> stagger -> execution bonus,
 * armored heavies, thrown-weapon stagger, door kick stagger + door
 * open/solid rules, floor clear -> exit -> next floor, and the win flow.
 */
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:4173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? `  (${detail})` : ''));
};

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--autoplay-policy=no-user-gesture-required'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForFunction('!!window.DD');

  const begin = async (levelIndex = 0) => {
    await page.evaluate((li) => {
      const { flow } = window.DD;
      flow.levelIndex = li; flow.score = 0;
      flow.beginLevel();
    }, levelIndex);
    await sleep(500);
  };
  const scene = fn => page.evaluate(`(() => {
    const S = window.DD.game.scene.getScene('play');
    return (${fn})(S);
  })()`);

  await begin();

  // --- 1. gun kill -> score + weapon drop ---
  let r = await scene(`(S) => {
    const p = S.player;
    const e = S.enemies.find(x => x.alive);
    e.x = p.x + 60; e.y = p.y;
    p.weapon = 'pistol'; p.ammo = 9; p.ang = 0;
    const before = { score: S.score, pickups: S.pickups.length };
    S.fireGun();
    for (let i = 0; i < 20; i++) S.updateBullets(1/60);
    return { dead: !e.alive, gain: S.score - before.score, drop: S.pickups.length - before.pickups };
  }`);
  check('gun kill', r.dead);
  check('score awarded', r.gain > 0, 'gain=' + r.gain);
  check('weapon dropped', r.drop === 1);

  // --- 2. bullet parry deflects ---
  r = await scene(`(S) => {
    const p = S.player;
    S.bullets.length = 0;
    S.bullets.push({ x: p.x + 30, y: p.y, vx: -600, vy: 0, life: 1.4, friendly: false, dmg: 1 });
    p.parryT = 0.2;
    const before = S.score;
    S.updateBullets(1/60);
    const b = S.bullets[0];
    return { friendly: b && b.friendly, alive: p.alive, gain: S.score - before, slow: S.slowT > 0 };
  }`);
  check('parry deflects bullet', r.friendly && r.alive);
  check('parry score + slow-mo', r.gain === 50 && r.slow, 'gain=' + r.gain);

  // --- 3. unparried bullet kills -> death overlay ---
  await begin();
  r = await scene(`(S) => {
    const p = S.player;
    S.bullets.push({ x: p.x + 8, y: p.y, vx: -300, vy: 0, life: 1, friendly: false, dmg: 1 });
    p.parryT = 0; p.inv = 0;
    S.updateBullets(1/60);
    return { alive: p.alive };
  }`);
  check('bullet kills without parry', !r.alive);
  await sleep(900);
  r = await page.evaluate(() => ({
    mode: window.DD.flow.mode,
    overlay: document.querySelector('#ov-dead').classList.contains('on'),
  }));
  check('death -> game over overlay', r.mode === 'dead' && r.overlay, 'mode=' + r.mode);

  // --- 4. melee windup parried -> stagger -> execution ---
  await begin();
  r = await scene(`(S) => {
    const p = S.player;
    const e = S.enemies.find(x => x.alive && x.rush);
    e.x = p.x + 30; e.y = p.y; e.aware = true; e.windup = 0.01;
    p.parryT = 0.2;
    S.updateEnemy(e, 1/30);
    const staggered = e.stun > 0;
    p.x = e.x - 30; p.y = e.y;
    p.weapon = 'fists'; p.ang = 0; p.atkT = 0;
    const before = S.score;
    S.meleeAttack();
    return { staggered, playerAlive: p.alive, dead: !e.alive, gain: S.score - before };
  }`);
  check('parried melee staggers attacker', r.staggered && r.playerAlive);
  check('staggered enemy executed in one hit', r.dead, 'points=' + r.gain);

  // --- 5. unparried melee strike kills ---
  await begin();
  r = await scene(`(S) => {
    const p = S.player;
    const e = S.enemies.find(x => x.alive && x.rush);
    e.x = p.x + 30; e.y = p.y; e.aware = true; e.windup = 0.01;
    p.parryT = 0; p.inv = 0;
    S.updateEnemy(e, 1/30);
    return { alive: p.alive };
  }`);
  check('unparried melee strike kills', !r.alive);

  // --- 6. heavy armor: 3 hits ---
  await begin();
  r = await scene(`(S) => {
    S.spawnEnemy('heavy', 100, 100);
    const e = S.enemies[S.enemies.length - 1];
    S.damageEnemy(e, 1, 10, 0); const a1 = e.alive;
    S.damageEnemy(e, 1, 10, 0); const a2 = e.alive;
    S.damageEnemy(e, 1, 10, 0);
    return { a1, a2, a3: e.alive };
  }`);
  check('heavy survives 2 hits, dies on 3rd', r.a1 && r.a2 && !r.a3);

  // --- 7. thrown weapon damages + staggers a heavy ---
  r = await scene(`(S) => {
    const p = S.player;
    S.spawnEnemy('heavy', p.x + 40, p.y);
    const e = S.enemies[S.enemies.length - 1];
    p.weapon = 'bat'; p.ang = 0;
    S.throwWeapon();
    for (let i = 0; i < 10; i++) S.updateThrowables(1/60);
    return { hp: e.hp, stunned: e.stun > 0, alive: e.alive };
  }`);
  check('throw damages + staggers heavy', r.hp === 1 && r.stunned && r.alive, 'hp=' + r.hp);

  // --- 8. doors: closed = solid + sight-blocking; kick staggers ---
  await begin();
  r = await scene(`(S) => {
    const door = S.doors[0];
    const closedSolid = S.solid(door.cx, door.cy);
    // stash an enemy right behind the door
    S.spawnEnemy('goon', door.cx, door.cy + 20);
    const e = S.enemies[S.enemies.length - 1];
    S.kickDoor(door);
    const openSolid = S.solid(door.cx, door.cy);
    return { closedSolid, open: door.state.open, openSolid, stunned: e.stun > 0 };
  }`);
  check('closed door is solid', r.closedSolid);
  check('kick opens door', r.open && !r.openSolid);
  check('kick staggers enemy behind door', r.stunned);

  // --- 9. clear floor -> exit -> clear overlay -> next floor ---
  r = await scene(`(S) => {
    for (const e of S.enemies) if (e.alive) S.killEnemy(e, 10, 0, false);
    S.update(0, 16);
    const cleared = S.cleared;
    const T = 32;
    S.player.x = S.lvl.exit.tx * T + T/2;
    S.player.y = S.lvl.exit.ty * T + T/2;
    S.update(0, 16);
    return { cleared, over: S.over };
  }`);
  check('all dead -> floor cleared', r.cleared);
  await sleep(400);
  r = await page.evaluate(() => ({
    mode: window.DD.flow.mode,
    overlay: document.querySelector('#ov-clear').classList.contains('on'),
  }));
  check('exit -> clear screen', r.mode === 'clear' && r.overlay, 'mode=' + r.mode);

  r = await page.evaluate(async () => {
    window.DD.flow.nextLevel();
    const briefing = window.DD.flow.mode === 'briefing';
    const name = document.getElementById('brief-chapter').textContent;
    window.DD.flow.beginLevel();
    await new Promise(res => setTimeout(res, 500));
    const S = window.DD.game.scene.getScene('play');
    return { briefing, name, level: window.DD.flow.levelIndex, enemies: S.enemies.length };
  });
  check('next floor briefing + start', r.briefing && r.level === 1 && r.enemies > 0, `${r.name}, enemies=${r.enemies}`);

  // --- 10. final floor win flow ---
  await begin(2);
  await scene(`(S) => {
    for (const e of S.enemies) if (e.alive) S.killEnemy(e, 10, 0, false);
    S.update(0, 16);
    const T = 32;
    S.player.x = S.lvl.exit.tx * T + T/2;
    S.player.y = S.lvl.exit.ty * T + T/2;
    S.update(0, 16);
  }`);
  await sleep(400);
  r = await page.evaluate(() => ({
    mode: window.DD.flow.mode,
    overlay: document.querySelector('#ov-win').classList.contains('on'),
    best: window.DD.flow.best,
  }));
  check('last floor -> win screen', r.mode === 'win' && r.overlay, 'best=' + r.best);

  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); }
  const failed = results.filter(x => !x).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed || errors.length) process.exit(1);
} finally {
  await browser.close();
}
