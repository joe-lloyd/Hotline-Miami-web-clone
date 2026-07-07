# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DEAD DROP — a neon-noir top-down action game (Hotline Miami-inspired). One-hit-kill combat with melee/guns, a dodge roll, a parry mechanic (deflects bullets, staggers melee attackers for an execution bonus), throwable weapons, and kickable doors. Built with Phaser 3 + TypeScript + Vite. No image or audio assets ship with the game — every sprite is drawn procedurally into textures at boot, and every sound is synthesized live with WebAudio.

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

Three registries define everything a level designer would touch, and none of them require touching AI/rendering code to extend:

- `src/data/weapons.ts` — `WEAPONS` (melee vs. gun stats, throwability) and `PICKUP_CHARS` (map-char → weapon).
- `src/data/enemies.ts` — `ENEMY_TYPES` (behavior: `'melee'` telegraphs a parryable windup strike; `'ranged'` keeps distance and rushes when out of ammo), each with a unique map `char` and a `CharPalette`. `ENEMY_CHARS` is the derived char→type lookup.
- `src/data/levels.ts` — `LEVELS[]`, each an ASCII map (`#` wall, `.` floor, `+` door, `P` start, `X` exit, plus enemy/weapon chars) with briefing text and per-floor neon colors/music root.

`src/systems/level.ts` (`parseLevel`) turns a `LevelDef` into the collision grid, spawn points, door states (with hinge orientation inferred from neighboring walls), and precomputed neon wall-trim edge segments. It has no Phaser dependency, so it's the layer to unit-test if map-generation logic grows.

All tuning constants (speeds, cooldowns, camera behavior, scoring) live in `src/config.ts` — change game feel there, not scattered through `PlayScene`.

### Runtime-generated textures

`src/textures.ts` draws every sprite once at boot: character parts (torso/head/foot per palette, at `RES = 4`x supersampling for crispness under the zoomed camera), weapons, doors, glow discs. **Textures are pre-colored, never tinted at runtime** (`setTint` is WebGL-only; the game targets `Phaser.AUTO` and must render identically under the Canvas fallback) — see `shade()` for the multiply-based recoloring helper used to build variants (e.g. darker corpse textures).

### Character rig (articulation)

`src/actors/CharacterRig.ts` is a Phaser `Container` tree: `feetC` (rotates to movement direction; legs/feet stride via `poseLimb`, which stretches a limb image between two joint points every frame) and `torsoC` (rotates to aim direction; arms/weapon similarly stretched to hand targets). This is what makes limbs actually articulate rather than being baked into a single sprite. Actions (`playSwing`, `playPickup`, `playKick`, `playThrow`, `playRoll`) are short timed state machines (`Action` interface) that override hand/foot targets for their duration. `toCorpse()` reposes the same parts into a sprawled body and swaps to darkened textures — corpses are the same rig object, not a separate sprite.

### PlayScene responsibilities

`src/scenes/PlayScene.ts` owns: player input/movement/dodge/parry, enemy AI (patrol → alert via line-of-sight or gunshot noise → chase/shoot or telegraphed melee), bullets/throwables, door open/kick logic, scoring/combo, screen shake, slow-mo (parry reward scales `this.ts`/`tweens.timeScale`), and the camera (Phaser follow + manual look-ahead toward the mouse via `setFollowOffset`). It communicates *outward* only through two game events — `'dd-death'` and `'dd-exit'` (both carry the current score) — which `src/main.ts`'s `Flow` class listens for to drive the DOM overlay state machine. Keep that boundary: PlayScene shouldn't reach into menu/overlay DOM, and main.ts shouldn't reach into simulation internals except via those events (tests are the sanctioned exception, via the debug handle).

### Everything else is DOM, not canvas

Menus, briefings, pause, death/clear/win screens are plain HTML overlays in `index.html` (`.overlay` divs toggled via class) styled in `src/style.css`, not Phaser scenes — only the HUD (`src/scenes/HudScene.ts`, weapon/ammo/cooldowns/score/combo) runs as a second always-on-top Phaser scene with an unzoomed camera, since it needs to read live sim state every frame without being affected by the play camera's zoom/shake.

### Audio

`src/audio.ts` (`Synth` class, singleton `audio`) generates all sound with WebAudio oscillators/noise buffers — `sfx(name)` for one-shots, `startMusic(rootHz)` for a procedural 128bpm loop per floor. No audio files exist anywhere in the project. `audio.init()` must be called from a user gesture (wired to the START button) or the AudioContext will be suspended.

## Adding content (common tasks)

- **New weapon**: add to `WEAPONS` in `data/weapons.ts` (+ `PICKUP_CHARS` if it should spawn on maps). Unknown weapon textures fall back to the pistol sprite (see `getWeaponTex` in `textures.ts`), so it's playable immediately; add a real sprite case in `makeSharedTextures` if desired.
- **New enemy type**: add to `ENEMY_TYPES` in `data/enemies.ts` with a unique `char`, then use that char in any level map. No AI code changes needed — behavior is entirely driven by the `behavior`/`speed`/`sight`/`windup`/etc. fields.
- **New level**: append a `LevelDef` to `LEVELS` in `data/levels.ts`. Exactly one `P` and one `X` required; `parseLevel` will derive everything else. Floor counter and progression pick it up automatically since they read `LEVELS.length`.

## Windows-specific gotchas (this dev environment)

- Puppeteer paths are hardcoded to `C:\Program Files\Google\Chrome\Application\chrome.exe` in both test files.
- `vite preview`/dev servers spawned via `shell:true` on Windows are wrapped in `cmd.exe` — killing the parent PID doesn't kill the actual server process. `test/run.mjs` uses `taskkill /pid <pid> /T /F` to kill the whole tree; do the same manually if a port is stuck (`Get-NetTCPConnection -LocalPort <port> -State Listen | Stop-Process`).
