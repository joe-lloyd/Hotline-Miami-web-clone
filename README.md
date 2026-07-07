# DEAD DROP

*A neon-noir top-down action game. Run the package. Bury the crew. Buy back your freedom.*

One-hit kills, both ways. Fight through three floors of the Voronov organization
with fists, bats, knives and guns — dodge through gunfire, parry blades and
bullets, and burn the ledger that owns you.

Built with zero dependencies: plain HTML + canvas + WebAudio. No build step,
no assets, no frameworks. The whole game is data-driven from three small files.

## Play it locally

Browsers block classic `file://` pages from some features, so serve the folder:

```
python -m http.server 8000     # or: npx serve
```

then open http://localhost:8000

## Deploy

The game is a static site — the root folder (minus `test/` and the prototype
files) is the deployable artifact:

- **itch.io** — zip `index.html`, `css/`, `js/` and upload as an HTML5 game
  (viewport 960×600, but it scales to any size).
- **Netlify / Vercel / Cloudflare Pages** — drag-and-drop the folder or point
  the project at the repo. No build command, publish directory = root.
- **GitHub Pages** — push and enable Pages on the branch.

## Controls

| Key | Action |
| --- | --- |
| WASD | move |
| Mouse | aim |
| Left click | attack / shoot |
| Shift / Space | dodge (i-frames + afterimage) |
| Right click / F | parry — deflects bullets, staggers melee attackers |
| E | pick up weapon |
| Q | throw weapon (damages + staggers) |
| Esc | pause |

Parried attackers are **staggered**: any hit executes them for double points.
Deflected bullets fly back at the nearest enemy. Kills chain into a combo
multiplier; gunfire alerts everyone nearby.

## Project layout

```
index.html        stage + menu/briefing/pause/death/clear/win overlays
css/style.css     UI styling + CRT effects
js/config.js      every tuning knob (speeds, cooldowns, camera, zoom)
js/weapons.js     weapon registry            <- add weapons here
js/enemies.js     enemy type registry        <- add enemy types here
js/levels.js      ASCII floor plans + text   <- add levels here
js/audio.js       synthesized sfx + music (no audio files)
js/render.js      canvas renderer (characters, world, HUD)
js/game.js        state machine, AI, combat, camera
js/main.js        DOM wiring + window scaling
test/             headless browser tests (see below)
```

`Dead Drop.dc.html` + `support.js` are the original prototype, kept for reference.

## Adding content

**A new floor** — append an object to `DD.LEVELS` in `js/levels.js`: a name,
briefing paragraphs, two accent colors, and an ASCII map (`#` wall, `.` floor,
`+` doorway, `P` start, `X` exit, `g/n/u/h` enemies, `1-4` weapon pickups).
The floor counter, briefing screen and progression pick it up automatically.

**A new enemy type** — add an entry to `DD.ENEMY_TYPES` in `js/enemies.js`
with a unique `char`, then use that char in any map. Behavior (`melee` /
`ranged`), stats and colors are all data; no AI code needed.

**A new weapon** — add an entry to `DD.WEAPONS` in `js/weapons.js`, and give
it a pickup char in `DD.PICKUP_CHARS`. Optionally add a sprite case in
`js/render.js` (`drawHeldWeapon` / `drawPickup`) — unknown weapons fall back
to a pistol shape.

## Tests

Headless-browser test suites (need Node + Chrome installed):

```
python -m http.server 8321     # serve the game on port 8321 first
cd test
npm install
npm test                       # smoke test + 17 mechanics checks
```

`smoke.test.js` boots the real page and simulates input; `mechanics.test.js`
verifies combat rules end-to-end (kills, parry, stagger executions, armor,
floor progression, death/win flows) via the `DD.game` debug handle.
