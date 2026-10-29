# Brainrot Runners — VS Code Extension Plan

## 1. Overview
Brainrot Runners is an endless 3-lane runner that runs inside a VS Code webview panel. The player dodges obstacles, collects "brain cells" (coins) and survives as long as possible while the game keeps speeding up. High scores are stored locally per machine and need no network access.

## 2. Goals / Non-goals
**Goals**
- Command `Brainrot Runners: Play` opens the game in an editor tab.
- Core loop: switch lanes, jump, slide, collect coins, avoid obstacles, die, restart.
- Speed and difficulty go up continuously over time.
- Local top-10 high-score table, which persists across VS Code restarts.
- No runtime dependencies, works offline, and stays at 60 fps on an average laptop.

**Non-goals (v1)**
- Online leaderboards, accounts, telemetry.
- In-app purchases, a shop or unlockable characters (possible later).
- Real 3D engine (we use pseudo-3D on Canvas 2D).

## 3. Tech Stack
| Concern | Choice |
|---|---|
| Language | TypeScript (strict) |
| Extension host | VS Code API `^1.85` |
| Rendering | HTML5 Canvas 2D in a `WebviewPanel`, pseudo-3D perspective projection |
| Bundling | esbuild (two bundles: extension and webview) |
| Unit tests | Vitest (pure game logic, no DOM) |
| Integration tests | `@vscode/test-cli` + `@vscode/test-electron` |
| Lint / format | ESLint (typescript-eslint) + Prettier |
| Packaging | `@vscode/vsce` |

## 4. Project Structure
```
BrainrotRunner/
├─ package.json            # extension manifest, commands, scripts
├─ tsconfig.json
├─ esbuild.mjs             # builds dist/extension.js + dist/webview.js
├─ .eslintrc / eslint.config.mjs, .prettierrc
├─ .vscode-test.mjs
├─ src/
│  ├─ extension.ts         # activate(): registers commands
│  ├─ GamePanel.ts         # creates/reuses the WebviewPanel, CSP, message routing
│  ├─ highScores.ts        # HighScoreStore over context.globalState
│  └─ messages.ts          # shared typed message contracts (host <-> webview)
├─ webview/
│  ├─ main.ts              # bootstraps canvas, input, loop
│  ├─ game/
│  │  ├─ state.ts          # GameState type + createInitialState()
│  │  ├─ update.ts         # update(state, input, dt) – pure
│  │  ├─ difficulty.ts     # speed curve + spawn density – pure
│  │  ├─ spawner.ts        # obstacle/coin pattern generation (seeded RNG)
│  │  ├─ collision.ts      # lane/height AABB checks – pure
│  │  ├─ player.ts         # lane switch, jump arc, slide timing
│  │  └─ rng.ts            # seeded PRNG (mulberry32) for testability
│  ├─ render/
│  │  ├─ projection.ts     # world (lane, z, y) -> screen (x, y, scale)
│  │  ├─ renderer.ts       # draws track, obstacles, coins, player, HUD
│  │  └─ sprites.ts        # procedurally drawn original characters/obstacles
│  ├─ input.ts             # keyboard + swipe/drag mapping -> InputAction
│  ├─ audio.ts             # tiny WebAudio blips (mutable)
│  └─ ui.ts                # title, pause, game-over, high-score overlays (DOM)
├─ media/                  # icon.png, styles.css
└─ test/
   ├─ unit/                # vitest: difficulty, collision, spawner, update, highScores
   └─ integration/         # extension activates, command opens panel
```

## 5. Gameplay Design
**World model.** There are 3 lanes (`-1, 0, 1`). The player stays at `z = 0` and objects move toward the player along `z` at `speed` units/sec. Distance travelled (`distance += speed * dt`) drives the score.

**Controls**
| Action | Keys | Mouse/trackpad |
|---|---|---|
| Lane left / right | ← / → or A / D | drag left / right |
| Jump | ↑ / W / Space | drag up |
| Slide | ↓ / S | drag down (also cancels a jump with a fast fall) |
| Pause | P / Esc | — |
| Restart | R / Enter on game-over | click "Run again" |

**Player.** Lane switches tween over about 120 ms. A jump is a parabolic arc lasting about 0.6 s. A slide lowers the hitbox for about 0.6 s. Input is buffered for 150 ms so fast key presses aren't lost.

**Obstacles (original theme)**
- *Low barrier* ("Doomscroll Fence"): jump or slide around it by changing lane.
- *High bar* ("Ratio Banner"): slide under it.
- *Full block* ("Brick of Cringe"): only a lane change avoids it.
- *Moving block* ("Sigma Cart"): a full block that also moves toward the player faster than the track (introduced after about 60 s).

**Collectibles**
- Brain cells (coins): +10 points each, spawned in lines and arcs.
- Power-ups (v1 stretch): *Magnet*, *2× Score*, *Shield* (absorbs one hit).

**Spawner rules**
- Patterns are pre-authored "chunks" chosen at random by a seeded RNG.
- Every chunk is guaranteed to leave at least one passable lane (validated in tests).
- There is a minimum reaction gap between obstacle rows, which shrinks with speed but never drops below a fixed floor.

**Scoring**
- `score = floor(distance * multiplier) + coins * 10`
- The multiplier goes up by +1 every 30 s survived, capped at ×5.

**Death.** Any hit without a shield ends the run: a short crash animation plays, then the game-over overlay appears.

## 6. Difficulty / Speed Curve (`difficulty.ts`)
- `speed(t) = min(MAX_SPEED, BASE_SPEED + ACCEL * t)` plus a slight ease, e.g. `BASE_SPEED * (1 + 0.04 * t^0.85)`, clamped.
- Starting values (tunable constants): `BASE_SPEED = 12 u/s`, `MAX_SPEED = 45 u/s`, max speed reached after about 4–5 minutes.
- Spawn density and pattern difficulty tier rise with `t`. Tier 1 (0–30 s) has single obstacles only, tier 2 has two-lane rows, tier 3 adds moving blocks.
- The HUD shows the current speed as a "rot level" meter so the player can see the speed-up.
- All constants live in one `CONFIG` object for tuning.

## 7. Game Loop & Rendering
- `requestAnimationFrame` loop with a fixed timestep (1/120 s) and an accumulator, so the physics is deterministic. Rendering is interpolated.
- `update()` is pure: `(state, actions, dt) => state`. This keeps the logic fully unit-testable without a DOM.
- Pseudo-3D: `projection.ts` maps `(lane, y, z)` to screen coordinates using a vanishing point and `scale = focal / (z + focal)`. Objects are drawn far to near.
- Visual style: bright, chaotic "brainrot" palette, an animated checkerboard track and parallax background shapes. Characters are drawn procedurally as original shapes, so there are no third-party assets.
- Canvas resizes with the panel (`ResizeObserver`) and handles `devicePixelRatio`.
- The game auto-pauses when the panel loses visibility (`onDidChangeViewState`, plus `document.visibilitychange` in the webview).

## 8. Extension Host ↔ Webview
**Commands (package.json `contributes.commands`)**
- `brainrotRunners.play`: open or reveal the game panel.
- `brainrotRunners.showHighScores`: open the panel on the high-score screen.
- `brainrotRunners.resetHighScores`: clear the high scores, after a confirmation modal.

**Settings (`contributes.configuration`)**
- `brainrotRunners.sound` (boolean, default true)
- `brainrotRunners.reducedMotion` (boolean; turns down screen shake and flashing)

**Webview security**
- Strict CSP: `default-src 'none'; script-src 'nonce-…'; style-src ${webview.cspSource}; img-src ${webview.cspSource} data:`.
- `localResourceRoots` is limited to `dist/` and `media/`.
- `retainContextWhenHidden: false`. State that needs to survive is sent to the host.

**Typed messages (`src/messages.ts`)**
- Webview → Host: `ready`, `gameOver { score, coins, distance, durationMs }`, `requestHighScores`
- Host → Webview: `init { highScores, settings }`, `highScores { list, newRank? }`

## 9. High Scores (`highScores.ts`)
- Stored in `context.globalState` under the key `brainrotRunners.highScores`. This is local to the machine and persists across sessions. Settings Sync is **not** opted in (`setKeysForSync` is not called), so scores stay local.
- Entry: `{ score: number, coins: number, distance: number, durationMs: number, date: string /* ISO */ }`.
- `HighScoreStore` API: `list(): Entry[]`, `submit(entry): { list, rank | null }`, `reset()`.
- Keeps the top 10 sorted by score (descending), with earlier dates winning ties. It validates and sanitizes loaded data, discarding malformed entries.
- The game-over screen shows the final score, a "NEW HIGH SCORE!" banner with the rank if the run placed, and the top-10 table. Best score is always visible in the HUD.

## 10. UI Screens
1. **Title:** logo, "Press Space to Run", controls summary, best score.
2. **HUD:** score, coins, multiplier, rot-level speed meter, pause hint.
3. **Pause:** resume / restart / quit to title.
4. **Game over:** score breakdown, new-record banner, top-10 table, "Run again".

## 11. Testing (required by AGENTS.md)
**Unit (Vitest, `test/unit/`)**
- `difficulty.test.ts`: speed rises monotonically, never exceeds `MAX_SPEED`, tier thresholds are correct.
- `collision.test.ts`: jump clears a low barrier, slide clears a high bar, a full block always hits within its lane, adjacent lanes never collide.
- `spawner.test.ts`: for many seeds, every generated row leaves at least one passable lane and the reaction gap never drops below the floor.
- `player.test.ts`: lane clamping at the edges, jump arc returns to the ground, input buffering works.
- `update.test.ts`: distance and score accumulate correctly, collision ends the game, the multiplier steps up.
- `highScores.test.ts` (with an in-memory Memento mock): sorting, top-10 truncation, rank reporting, tie-break, malformed data handling, reset.

**Integration (`@vscode/test-electron`, `test/integration/`)**
- The extension activates, and `brainrotRunners.play` creates a webview panel with the expected viewType.
- The reset command clears the stored scores.

**Scripts**
- `npm run build`, `npm run watch`, `npm run lint`, `npm run test:unit`, `npm run test:integration`, `npm test` (all), `npm run package`.

## 12. Milestones
1. **Scaffold:** package.json manifest, TS/esbuild/ESLint/Vitest config, command opens an empty webview with CSP. A smoke integration test passes.
2. **Core logic:** state, player, collision, difficulty, seeded spawner, all with unit tests.
3. **Rendering:** projection, track, obstacles, coins, player, HUD, then the input mapping.
4. **Game flow:** title, pause, game over, restart, auto-pause on hidden.
5. **High scores:** HighScoreStore, message wiring, game-over table, reset command, tests.
6. **Polish:** sound, reduced motion, power-ups (stretch), tuning pass on the speed curve.
7. **Release:** icon, README with GIF, CHANGELOG, `vsce package`, manual QA.

## 13. Verification
- `npm run lint && npm test` is green (unit and integration).
- Press F5 (Extension Development Host), then run **Brainrot Runners: Play**:
  - All controls respond, and speed visibly increases over about 60 s.
  - Dying shows game over. A score that places appears in the top-10 table.
  - Close and reopen VS Code: the high scores are still there.
  - **Reset High Scores** clears them after confirmation.
  - Switching tabs auto-pauses the game, and there are no CSP errors in the webview devtools.
- `vsce package` builds a `.vsix` that installs and runs in a clean VS Code profile.

## 14. Conventions
- PR titles: `[Brainrot Runners] <Title>`.
- Every code change comes with new or updated tests. Lint and tests must pass before committing.
