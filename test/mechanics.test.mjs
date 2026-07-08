/**
 * test/mechanics.test.mjs — end-to-end verification of the combat rules,
 * driven through the window.DD debug handle (flow + Phaser game). The
 * PlayScene keeps its simulation in plain public state, so the test can
 * teleport enemies, inject bullets and step subsystems deterministically.
 *
 * Covers: gun kills + drops + score, bullet parry (deflect/slow-mo/score,
 * weapon required — fists can't deflect), unparried deaths, melee windup
 * parry -> stagger -> execution bonus, punch knockdown -> head stomp,
 * directional vision (sneaking up from behind) + reaction delay, armored
 * heavies, thrown-weapon stagger, door kick stagger + door open/solid
 * rules, and the level/board campaign flow: 'reach' boards (open exit +
 * ghost bonus), board -> interlude dialogue -> next board, level clear
 * screen, intro dialogue -> briefing, and the ending scene -> win.
 *
 * Combat tests run on LV.02 board 0 (THE WAREHOUSE) via begin(1, 0).
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

  // jump straight into a board (skips any dialogue a previous test left up)
  const begin = async (levelIndex = 1, boardIndex = 0) => {
    await page.evaluate(({ li, bi }) => {
      const { flow } = window.DD;
      flow.skipStory();
      flow.levelIndex = li; flow.boardIndex = bi; flow.score = 0;
      flow.beginBoard();
    }, { li: levelIndex, bi: boardIndex });
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

  // --- 2. bullet parry deflects (holding a weapon) ---
  r = await scene(`(S) => {
    const p = S.player;
    S.bullets.length = 0;
    S.bullets.push({ x: p.x + 30, y: p.y, vx: -600, vy: 0, life: 1.4, friendly: false, dmg: 1 });
    p.weapon = 'pistol';
    p.parryT = 0.2;
    const before = S.score;
    S.updateBullets(1/60);
    const b = S.bullets[0];
    return { friendly: b && b.friendly, alive: p.alive, gain: S.score - before, slow: S.slowT > 0 };
  }`);
  check('parry deflects bullet', r.friendly && r.alive);
  check('parry score + slow-mo', r.gain === 50 && r.slow, 'gain=' + r.gain);

  // --- 2b. bare fists can NOT deflect bullets ---
  r = await scene(`(S) => {
    const p = S.player;
    S.bullets.length = 0;
    S.bullets.push({ x: p.x + 40, y: p.y, vx: -600, vy: 0, life: 1.4, friendly: false, dmg: 1 });
    p.weapon = 'fists';
    p.parryT = 0.2;
    S.updateBullets(1/60);
    const b = S.bullets[0];
    const stillHostile = !!b && !b.friendly;
    S.bullets.length = 0;
    return { stillHostile, alive: p.alive };
  }`);
  check('fists cannot parry bullets', r.stillHostile && r.alive);

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

  // --- 4b. punch knocks down; stomp finishes ---
  await begin();
  r = await scene(`(S) => {
    const p = S.player;
    S.spawnEnemy('goon', p.x + 30, p.y);
    const e = S.enemies[S.enemies.length - 1];
    p.weapon = 'fists'; p.ang = 0; p.atkT = 0; p.chainT = 0;
    S.meleeAttack();
    const downed = e.downed && e.alive;
    const before = S.score;
    S.meleeAttack(); // downed enemy in reach -> head stomp
    return { downed, dead: !e.alive, gain: S.score - before };
  }`);
  check('punch knocks down instead of killing', r.downed);
  check('stomp executes downed enemy', r.dead && r.gain > 0, 'gain=' + r.gain);

  // --- 4c. directional vision: sneaking up from behind + reaction lag ---
  r = await scene(`(S) => {
    const p = S.player;
    S.spawnEnemy('gunner', p.x + 100, p.y);
    const e = S.enemies[S.enemies.length - 1];
    e.ammo = 0;               // never actually fires during later checks
    e.ang = 0; e.patrolT = 9; // facing away from the player
    S.updateEnemy(e, 1/60);
    const unseen = !e.aware;
    e.ang = Math.PI;          // now facing the player
    S.updateEnemy(e, 1/60);
    return { unseen, seen: e.aware, react: e.react };
  }`);
  check('enemy facing away does not spot you', r.unseen);
  check('spotting you takes reaction time', r.seen && r.react >= 0.25, 'react=' + (r.react ?? 0).toFixed(2));

  // --- 4d. gunshot noise sends distant enemies to investigate ---
  r = await scene(`(S) => {
    const p = S.player;
    const noise = { x: p.x, y: p.y };
    S.spawnEnemy('gunner', p.x + 220, p.y);
    const e = S.enemies[S.enemies.length - 1];
    e.ammo = 0;
    e.aware = false; e.lastSeen = null; e.hadLOS = false;
    // park the player far away so only the SOUND draws the gunner in
    // (otherwise it opens the door, sees you, and correctly holds range)
    p.x = 35.5 * 32; p.y = 22.5 * 32;
    S.alertNoise(noise.x, noise.y);
    const heard = e.aware && !!e.lastSeen;
    const before = Math.hypot(e.x - noise.x, e.y - noise.y);
    for (let i = 0; i < 60; i++) S.updateEnemy(e, 1/60);
    const after = Math.hypot(e.x - noise.x, e.y - noise.y);
    return { heard, before, after };
  }`);
  check('gunner hears shot and investigates', r.heard && r.after < r.before - 40,
    `dist ${Math.round(r.before)} -> ${Math.round(r.after)}`);

  // --- 4e. pathfinding: routes around walls / through doors to a noise ---
  await begin();
  r = await scene(`(S) => {
    const p = S.player;
    const noise = { x: p.x, y: p.y };
    // around a corner: the straight line to the noise is walled off, the
    // only way is up the side corridor and through the door
    S.spawnEnemy('gunner', p.x + 220, p.y + 64);
    const e = S.enemies[S.enemies.length - 1];
    e.ammo = 0;
    p.x = 35.5 * 32; p.y = 22.5 * 32;
    S.alertNoise(noise.x, noise.y);
    const before = Math.hypot(e.x - noise.x, e.y - noise.y);
    for (let i = 0; i < 90; i++) S.updateEnemy(e, 1/60);
    const after = Math.hypot(e.x - noise.x, e.y - noise.y);
    return { before, after };
  }`);
  check('pathfinds around walls to a noise', r.after < r.before - 60,
    `dist ${Math.round(r.before)} -> ${Math.round(r.after)}`);

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

  // --- 7b. persistent magazines: drops and throws keep their count ---
  await begin();
  r = await scene(`(S) => {
    const p = S.player;
    // a gunner with 5 rounds left drops a 5-round pistol
    S.spawnEnemy('gunner', p.x + 60, p.y);
    const e = S.enemies[S.enemies.length - 1];
    e.ammo = 5;
    S.killEnemy(e, 10, 0, false);
    const pk = S.pickups[S.pickups.length - 1];
    const dropAmmo = pk.st.ammo;
    p.x = pk.st.x; p.y = pk.st.y; p.weapon = 'fists'; p.ammo = 0;
    S.tryPickup();
    const picked = { w: p.weapon, ammo: p.ammo };
    // throwing it keeps the count too
    p.ammo = 3; p.ang = 0;
    S.throwWeapon();
    for (let i = 0; i < 60 && S.throwables.length; i++) S.updateThrowables(1/60);
    const landed = S.pickups[S.pickups.length - 1];
    return { dropAmmo, picked, thrownAmmo: landed.st.ammo, thrownW: landed.st.w };
  }`);
  check('dropped gun keeps its ammo count',
    r.dropAmmo === 5 && r.picked.w === 'pistol' && r.picked.ammo === 5,
    `drop=${r.dropAmmo}, picked=${r.picked.ammo}`);
  check('thrown gun keeps its ammo count',
    r.thrownW === 'pistol' && r.thrownAmmo === 3, 'ammo=' + r.thrownAmmo);

  // --- 7c. melee hitboxes match the animations: stab narrow, sweep wide ---
  await begin();
  r = await scene(`(S) => {
    const p = S.player;
    p.weapon = 'knife'; p.ang = 0; p.atkT = 0; p.chainT = 0;
    S.spawnEnemy('goon', p.x + 42, p.y);              // dead ahead
    const ahead = S.enemies[S.enemies.length - 1];
    S.spawnEnemy('goon', p.x + 29, p.y + 29);         // ~45° off-axis, in range
    const offAxis = S.enemies[S.enemies.length - 1];
    S.meleeAttack();
    const stab = { aheadDead: !ahead.alive, sideAlive: offAxis.alive };
    // same off-axis target dies to the wide two-handed bat sweep
    p.weapon = 'bat'; p.atkT = 0; p.chainT = 0;
    S.meleeAttack();
    return { ...stab, sweptDead: !offAxis.alive };
  }`);
  check('knife stab: narrow cone hits ahead only', r.aheadDead && r.sideAlive);
  check('bat sweep: wide arc catches off-axis', r.sweptDead);

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

  // --- 9. every board parses and the exit is walkable from spawn ---
  r = await page.evaluate(async () => {
    const { LEVELS, flow, game } = window.DD;
    const out = [];
    for (let li = 0; li < LEVELS.length; li++) {
      for (let bi = 0; bi < LEVELS[li].boards.length; bi++) {
        flow.levelIndex = li; flow.boardIndex = bi; flow.score = 0;
        flow.beginBoard();
        await new Promise(res => setTimeout(res, 350));
        const S = game.scene.getScene('play');
        const T = 32;
        const path = S.findPath(S.player.x, S.player.y,
          S.lvl.exit.tx * T + T / 2, S.lvl.exit.ty * T + T / 2);
        out.push({ id: li + '-' + bi, enemies: S.enemies.length, reachable: !!path });
      }
    }
    return out;
  });
  check('all boards parse + exit reachable', r.every(x => x.reachable && x.enemies > 0),
    r.map(x => x.id + (x.reachable ? ' ok' : ' BLOCKED')).join(', '));

  // --- 10. 'reach' board: exit open from the start; ghost bonus ---
  await begin(0, 0);
  r = await scene(`(S) => {
    const openAtStart = S.cleared && S.enemies.some(e => e.alive);
    const before = S.score;
    const T = 32;
    S.player.x = S.lvl.exit.tx * T + T/2;
    S.player.y = S.lvl.exit.ty * T + T/2;
    S.update(0, 16);
    return { openAtStart, over: S.over, gain: S.score - before };
  }`);
  check('reach board: exit open with enemies alive', r.openAtStart && r.over);
  check('ghost bonus for zero kills', r.gain === 500, 'gain=' + r.gain);

  // --- 11. finishing a level -> LEVEL CLEARED -> intro dialogue -> briefing ---
  await begin(0, 1);
  await scene(`(S) => {
    const T = 32;
    S.player.x = S.lvl.exit.tx * T + T/2;
    S.player.y = S.lvl.exit.ty * T + T/2;
    S.update(0, 16);
  }`);
  await sleep(400);
  r = await page.evaluate(() => ({
    mode: window.DD.flow.mode,
    overlay: document.querySelector('#ov-clear').classList.contains('on'),
  }));
  check('last board of level -> clear screen', r.mode === 'clear' && r.overlay, 'mode=' + r.mode);

  r = await page.evaluate(() => {
    window.DD.flow.nextLevel();               // -> LV.02 intro dialogue
    const dlg = window.DD.flow.mode;
    window.DD.flow.skipStory();               // -> briefing
    return {
      dlg,
      briefing: window.DD.flow.mode === 'briefing',
      name: document.getElementById('brief-chapter').textContent,
    };
  });
  check('next level -> intro dialogue -> briefing', r.dlg === 'dialog' && r.briefing, r.name);

  // --- 12. board exit -> interlude dialogue (once) -> next board ---
  await begin(1, 0);
  await scene(`(S) => {
    for (const e of S.enemies) if (e.alive) S.killEnemy(e, 10, 0, false);
    S.update(0, 16);
    const T = 32;
    S.player.x = S.lvl.exit.tx * T + T/2;
    S.player.y = S.lvl.exit.ty * T + T/2;
    S.update(0, 16);
  }`);
  await sleep(400);
  r = await page.evaluate(() => window.DD.flow.mode);
  check('board clear -> interlude dialogue', r === 'dialog', 'mode=' + r);
  r = await page.evaluate(async () => {
    window.DD.flow.skipStory();               // -> next board starts
    await new Promise(res => setTimeout(res, 450));
    const S = window.DD.game.scene.getScene('play');
    return { mode: window.DD.flow.mode, board: window.DD.flow.boardIndex, enemies: S.enemies.length };
  });
  check('interlude -> next board', r.mode === 'play' && r.board === 1 && r.enemies > 0,
    `board=${r.board}, enemies=${r.enemies}`);

  // --- 13. final board -> ending scene -> win screen ---
  await begin(1, 2);
  await scene(`(S) => {
    for (const e of S.enemies) if (e.alive) S.killEnemy(e, 10, 0, false);
    S.update(0, 16);
    const T = 32;
    S.player.x = S.lvl.exit.tx * T + T/2;
    S.player.y = S.lvl.exit.ty * T + T/2;
    S.update(0, 16);
  }`);
  await sleep(400);
  r = await page.evaluate(() => {
    const dlg = window.DD.flow.mode;
    window.DD.flow.skipStory();
    return {
      dlg,
      mode: window.DD.flow.mode,
      overlay: document.querySelector('#ov-win').classList.contains('on'),
      best: window.DD.flow.best,
    };
  });
  check('last board -> ending scene -> win screen',
    r.dlg === 'dialog' && r.mode === 'win' && r.overlay, 'best=' + r.best);

  if (errors.length) { console.log('PAGE ERRORS:\n' + errors.join('\n')); }
  const failed = results.filter(x => !x).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed || errors.length) process.exit(1);
} finally {
  await browser.close();
}
