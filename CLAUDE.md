# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DEAD DROP — a neon-noir top-down action game (Hotline Miami-inspired). One-hit-kill combat with melee/guns, a dodge roll, a parry mechanic (staggers melee attackers for an execution bonus; deflects bullets only while HOLDING a weapon — bare fists can't; the parry window is telegraphed by the rig's deflect animation, not a HUD arc), throwable weapons (swapping pickups throws the old weapon), and kickable doors. Weapons have a `grip` class (unarmed / 1h stab / 2h sweep / 1h gun / 2h gun) that drives both the hold stance and the attack animation, and the melee `range`/`arc` values ARE the hitbox — knife stabs a narrow cone, bat sweeps a wide arc. Guns carry persistent magazines: a dropped or thrown gun keeps exactly the rounds its last owner left in it (map pickups spawn full). Fists are nonlethal: a punch knocks an enemy down and they must be finished with a stomp before they get back up (parried/staggered targets still die to anything, fists included). Melee weapons have distinct first-swing (`cd`) and chained follow-up (`cd2`) speeds. Enemy vision is directional (`fov` + `react` reaction lag — sneaking up from behind works) and all enemy types investigate gunshot/kick noise. Kills pulse the whole floor red. Full gamepad support (twin-stick; menus too) with REMAPPABLE bindings — `src/padmap.ts` is the single source of truth (defaults: RT attack, LT parry, RB/R3 dodge, LB pick up/throw, A interact, START pause; persisted in localStorage), and the CONTROLLER overlay (main menu + pause menu) rebinds by pressing a button. There's a dedicated INTERACT input (keyboard F / pad A) driving an extensible interactables system in PlayScene (`addInteractable(x, y, r, use)`) for keys/computers/switches; nothing ships wired to it yet. The camera is unbounded — near a level edge the view drifts out over a per-board neon-gradient void — and boards can be NON-RECTANGULAR: map rows may be ragged, and `' '` cells are void (solid, undrawn, backdrop shows through). Built with Phaser 3 + TypeScript + Vite; deployable to Netlify via `netlify.toml` (publishes `dist/`). No image or audio assets ship with the game — every sprite is drawn procedurally into textures at boot, and every sound is synthesized live with WebAudio.

The campaign is LEVELS containing BOARDS: a level is a named chapter with one briefing and a run of boards (playable maps) that chain seamlessly; finishing a level shows the clear screen. Boards have an objective: `'clear'` (default — kill everyone to unlock the exit) or `'reach'` (exit open from the start; sneak or fight through, and exiting with zero corpses pays `GHOST_BONUS`). Between-the-action story is told in visual-novel dialogue scenes (full-body procedural character cutouts + typewriter text): levels have `intro`/`outro` scenes and boards have `intro` interludes, each played at most once per run — never replayed when you die and retry a board.

There is also a `legacy/` folder containing a earlier zero-dependency vanilla JS/Canvas version of the same game, kept for reference. It is not part of the active build; don't edit it unless specifically asked to.

## Commands

```
npm install         # first time setup
npm run dev          # Vite dev server (http://localhost:5173), hot reload
npm run build         # tsc --noEmit && vite build -> dist/
npm run preview       # serve the production build (http://localhost:4173)
npm run typecheck     # tsc --noEmit only
npm test              # builds, serves on :4173, runs both headless-Chrome suites
```

`npm test` runs `test/run.mjs`, which builds the project, starts `vite preview` on port 4173, then runs `test/smoke.test.mjs` (boots the real page, simulates raw keyboard/mouse input, fails on any console/page error) followed by `test/mechanics.test.mjs` (drives combat rules deterministically through the `window.DD` debug handle exposed by `src/main.ts`). Both require a real Chrome install at the hardcoded path `C:\Program Files\Google\Chrome\Application\chrome.exe` (Windows) via `puppeteer-core`.

To run a single test file manually: build and preview first (`npm run build && npm run preview`), then in another terminal `node test/smoke.test.mjs` or `node test/mechanics.test.mjs`. If port 4173 is already in use (leftover preview server), the preview will fail to start — free it first (`Get-NetTCPConnection -LocalPort 4173 -State Listen | Stop-Process`).

There is no separate lint command; TypeScript's `strict` mode plus `noUnusedLocals` (see `tsconfig.json`) is the enforcement layer, checked via `npm run typecheck` / the `build` script.

## Architecture

### Simulation vs. Phaser display objects (the key pattern)

Game state is kept as **plain serializable structs** (`src/types.ts`: `PlayerState`, `EnemyState`, `BulletState`, `ThrowableState`, `DoorState`, etc.), owned and mutated by `PlayScene`. Phaser objects (`CharacterRig`, `Door`) are **pure visuals** that read that state and pose themselves each frame — they never hold gameplay logic themselves. This split is why the headless test suite can reach into `window.DD.game.scene.getScene('play')` and directly mutate `S.player.x`, teleport enemies, inject bullets, or call `S.damageEnemy(...)` to test combat rules deterministically without simulating real input.

Collision is hand-rolled tile lookup (`PlayScene.solid()` / `circleWall()` / `moveEntity()`), not Arcade Physics — the one-hit-kill design needs exact, deterministic hit detection every frame, including against closed doors.

### Content is data, not code

Four registries define everything a level designer would touch, and none of them require touching AI/rendering code to extend:

- `src/data/weapons.ts` — `WEAPONS` (melee vs. gun stats, `grip` animation class, throwability; melee `range`/`arc` double as the hitbox, so keep them matched to the animation shape) and `PICKUP_CHARS` (map-char → weapon).
- `src/data/enemies.ts` — `ENEMY_TYPES` (behavior: `'melee'` telegraphs a parryable windup strike; `'ranged'` keeps distance and rushes when out of ammo; the unarmed `thug` is melee with `weapon: 'fists'` and drops nothing), each with a unique map `char` and a `CharPalette`. `ENEMY_CHARS` is the derived char→type lookup.
- `src/data/levels.ts` — `LEVELS[]`: each `LevelDef` has a briefing, story-scene hooks (`intro`/`outro`/`clearCopy`) and `boards: BoardDef[]`. Each board is an ASCII map (`#` wall, `.` floor, `' '` void for shaped/non-rectangular boards — rows may be ragged, `+` door, `P` start, `X` exit, plus enemy/weapon chars) with per-board neon colors/music root, plus `objective`/`goal`/`intro`.
- `src/data/story.ts` — `CHARACTERS` (name, plate color, screen side, `CharPalette` — Wren reuses `PLAYER_PAL` so the cutout matches the in-game rig) and `SCENES` (scene-id → dialogue lines; lines starting with `(` render as inner monologue).

`src/systems/level.ts` (`parseLevel`) turns a `BoardDef` into the collision grid, spawn points, door states (with hinge orientation inferred from neighboring walls), and precomputed neon wall-trim edge segments. It throws loudly on ragged map rows or a missing/duplicate `P`/`X`, so content typos fail the smoke test instead of leaking walkable void. It has no Phaser dependency, so it's the layer to unit-test if map-generation logic grows.

All tuning constants (speeds, cooldowns, camera behavior, scoring) live in `src/config.ts` — change game feel there, not scattered through `PlayScene`.

### Runtime-generated textures

`src/textures.ts` draws every sprite once at boot: character parts (torso/head/foot per palette, at `RES = 4`x supersampling for crispness under the zoomed camera), weapons, doors, glow discs. **Textures are pre-colored, never tinted at runtime** (`setTint` is WebGL-only; the game targets `Phaser.AUTO` and must render identically under the Canvas fallback) — see `shade()` for the multiply-based recoloring helper used to build variants (e.g. darker corpse textures).

### Character rig (articulation)

`src/actors/CharacterRig.ts` is a Phaser `Container` tree: `feetC` (rotates to movement direction; legs/feet stride via `poseLimb`, which stretches a limb image between two joint points every frame) and `torsoC` (rotates to aim direction; arms/weapon similarly stretched to hand targets). This is what makes limbs actually articulate rather than being baked into a single sprite. Actions (`playSwing`, `playPickup`, `playKick`, `playThrow`, `playRoll`) are short timed state machines (`Action` interface) that override hand/foot targets for their duration. `toCorpse()` reposes the same parts into a sprawled body and swaps to darkened textures — corpses are the same rig object, not a separate sprite.

### PlayScene responsibilities

`src/scenes/PlayScene.ts` owns: player input/movement/dodge/parry, enemy AI (patrol → alert via line-of-sight or gunshot noise → chase/shoot or telegraphed melee), bullets/throwables, door open/kick logic, scoring/combo, screen shake, slow-mo (parry reward scales `this.ts`/`tweens.timeScale`), and the camera (Phaser follow + manual look-ahead toward the mouse via `setFollowOffset`). It communicates *outward* only through two game events — `'dd-death'` and `'dd-exit'` (both carry the current score) — which `src/main.ts`'s `Flow` class listens for to drive the DOM overlay state machine. Keep that boundary: PlayScene shouldn't reach into menu/overlay DOM, and main.ts shouldn't reach into simulation internals except via those events (tests are the sanctioned exception, via the debug handle).

### Everything else is DOM, not canvas

Menus, briefings, pause, death/clear/win screens AND the visual-novel dialogue are plain HTML overlays in `index.html` (`.overlay` divs toggled via class) styled in `src/style.css`, not Phaser scenes — only the HUD (`src/scenes/HudScene.ts`, weapon/ammo/cooldowns/score/combo/board goal) runs as a second always-on-top Phaser scene with an unzoomed camera, since it needs to read live sim state every frame without being affected by the play camera's zoom/shake.

The `Flow` class in `main.ts` owns campaign progression (levelIndex + boardIndex, board-start score for retries, best score) and story gating: `playStory(id, done)` plays a scene at most once per run via a `seen` set. `src/dialogue.ts` (`DialoguePlayer`) only renders one scene — cutouts, name plate, typewriter — and calls back when done; input for it (click / Enter / Space / pad-A advance, Esc / START skip) is wired in `main.ts`. `src/portraits.ts` draws the full-body pixel cutouts from each character's `CharPalette` on an offscreen canvas (data URLs, `image-rendering: pixelated`) — same no-image-assets rule as `textures.ts`.

### Audio

`src/audio.ts` (`Synth` class, singleton `audio`) generates all sound with WebAudio oscillators/noise buffers — `sfx(name)` for one-shots. No audio files exist anywhere in the project. `audio.init()` must be called from a user gesture (wired to the START button) or the AudioContext will be suspended.

Music is sequenced by **Strudel** (`@strudel/core` Cyclist scheduler + `@strudel/mini` notation): one Gesaffelstein-style industrial track per level, defined in `src/tracks.ts` as patterns pre-compiled at module load ("BREACH" 110bpm for LV.01, "DESCENT" 115bpm for LV.02; extra levels reuse the last track). `playTrack(levelIndex, rootHz)` mounts a pattern on the shared Cyclist (safe to call live — pattern and tempo swap seamlessly, `rootHz` transposes the pitched voices per board); `stopTrack()` fades the music buses. Each pattern event is dispatched via a custom output to a synthesized voice in audio.ts — **deliberately not superdough** (`@strudel/webaudio`'s engine): its output is hardwired to `ctx.destination`, bypassing the FX chain, and its stock drums stream samples from a CDN, violating the no-assets rule. The music FX chain is voices → pumpBus (sidechain duck target, slammed by every kick) + kickBus → DynamicsCompressor → WaveShaper (tanh saturation) → master; SFX bypass it. Note: Strudel is AGPL-3.0 licensed.

## Adding content (common tasks)

- **New weapon**: add to `WEAPONS` in `data/weapons.ts` (+ `PICKUP_CHARS` if it should spawn on maps). Unknown weapon textures fall back to the pistol sprite (see `getWeaponTex` in `textures.ts`), so it's playable immediately; add a real sprite case in `makeSharedTextures` if desired.
- **New enemy type**: add to `ENEMY_TYPES` in `data/enemies.ts` with a unique `char`, then use that char in any board map. No AI code changes needed — behavior is entirely driven by the `behavior`/`speed`/`sight`/`windup`/etc. fields.
- **New board**: append a `BoardDef` to an existing level's `boards` in `data/levels.ts`. Exactly one `P` and one `X` required, all rows equal length (`parseLevel` throws otherwise); progression and the HUD counter pick it up automatically. Use `objective: 'reach'` + `goal` for open-exit stealth boards.
- **New level**: append a `LevelDef` (name, briefing, boards) to `LEVELS`. Optional `intro`/`outro`/`clearCopy` for story.
- **New story scene**: add lines to `SCENES` in `data/story.ts` (add speakers to `CHARACTERS` if needed — a palette is all a new character requires; the portrait is generated), then reference the scene id from a level's `intro`/`outro` or a board's `intro`. Scenes play once per run; death/retry never replays them.

## Windows-specific gotchas (this dev environment)

- Puppeteer paths are hardcoded to `C:\Program Files\Google\Chrome\Application\chrome.exe` in both test files.
- `vite preview`/dev servers spawned via `shell:true` on Windows are wrapped in `cmd.exe` — killing the parent PID doesn't kill the actual server process. `test/run.mjs` uses `taskkill /pid <pid> /T /F` to kill the whole tree; do the same manually if a port is stuck (`Get-NetTCPConnection -LocalPort <port> -State Listen | Stop-Process`).
