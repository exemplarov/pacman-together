# 001 — Project Init & Release 1 Foundation

Status: **in progress**

## Idea

Bootstrap the repository for **Pacman Together**: a browser game where up to 4 local players
(keyboard + gamepads) co-operatively control one Pacman — each player may only steer in the
direction(s) they claimed before the game starts. Release 1 delivers classic Pacman gameplay
with a polished neon-arcade look, a player lobby with direction claiming, persistent users,
and a SQLite-backed leaderboard, served by a Bun backend.

This feature covers: repo scaffolding, Bun server with HTML bundling, project structure,
styling foundation (design tokens / fonts), and the app shell that later features plug into.

## Research

- **Bun fullstack serving** — `Bun.serve({ routes })` can bundle & serve HTML entrypoints via
  ES module imports (`import index from "./index.html"`), with TS/TSX/CSS bundled
  automatically. API routes live next to HTML routes. Dev mode gives HMR.
  https://bun.com/docs/bundler/fullstack
- **bun:sqlite** — built-in, synchronous, better-sqlite3-style API (`db.query().get/all/run`),
  supports prepared statements and transactions. Good fit for a small leaderboard.
  https://bun.com/docs/runtime/sqlite
- **Pacman mechanics** (for later features, summarized here as release context) — the Pac-Man
  Dossier is the canonical reference: 28×36 grid (28×31 maze), 240 dots + 4 energizers,
  scatter/chase schedule, per-ghost targeting (Blinky/Pinky/Inky/Clyde), frightened mode with
  reversal, tunnel slowdown for ghosts, ghost house dot counters, Cruise Elroy.
  https://pacman.holenet.info/ / https://www.gamedeveloper.com/design/the-pac-man-dossier
- **Gamepad API** (for later features) — `gamepadconnected` requires a button press;
  `navigator.getGamepads()` must be polled per frame; `mapping === "standard"` gives a
  canonical d-pad layout. https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API

## Design / Problem brainstorm

**Problem: how to structure a canvas game + API server in one Bun app without frameworks?**
Options considered:
1. Two processes (static file server + API) — extra tooling, no benefit here.
2. Single Bun server: HTML route bundling the client TS, `/api/*` JSON routes in the same
   process. ✅ Chosen — zero-config, HMR in dev, one `bun run dev`.

**Problem: frontend architecture without a framework?**
Options considered:
1. Vanilla TS + DOM for screens (lobby, overlays) + Canvas for the game itself.
2. Introduce a UI framework (React/Preact) — heavier, needs deps, slows first release.
✅ Chosen: vanilla TS with small screen-manager module. The game is canvas-driven; menus are
simple DOM with CSS. Keeps zero deps.

**Problem: visual identity.** Neon arcade-modern (see decisions): dark background, neon glow
walls, glowing pellets, smooth 60fps animation. Foundation needed now: CSS custom properties
(color tokens, glow shadows), pixel/arcade font from Google Fonts (Press Start 2P), layout
shell (centered stage, HUD areas).

**Repo layout** (target for the whole release):

```
src/
  server/           # Bun.serve entry, API routes, db
    index.ts
    db.ts
    api/
  client/
    main.ts         # bootstrapping, screen manager
    screens/        # attract, lobby, pick, game, gameover, leaderboard (DOM overlays)
    game/           # engine: maze, actors, ghosts, render (canvas)
    input/          # keyboard slots + gamepads
    ui/             # dom helpers, toast, styles
    audio/          # WebAudio sfx
  shared/           # types shared client/server (api contracts, direction enum)
public/             # favicon etc.
specs/              # feature docs (this folder)
```

## Plan

- [x] `AGENTS.md` with the feature workflow (research → spec → HITL → implement → subagent
      review → commit).
- [x] `specs/` feature files for release 1 (001 init, 002 gameplay, 003 multiplayer,
      004 leaderboard).
- [x] `package.json` (scripts: dev/start/test), `tsconfig.json` (strict), `.gitignore`
      (`data/`, `node_modules`, logs).
- [x] `src/server/index.ts`: `Bun.serve` with `routes`: `/` → `index.html` (bundled),
      `/api/health` → `{status:"ok"}`; `error` handler; port from `PORT` env (default 3000).
- [x] `src/client/index.html` + `main.ts`: app shell — centered stage, background, font,
      screen-manager skeleton (game rAF loop intentionally deferred to 002 — see D19).
- [x] Styling foundation: design tokens (neon palette, glow), Press Start 2P font, base
      layout CSS.
- [x] `bun run dev` works; `bun test` passes (smoke test for `/api/health` handler).
- [x] Git init + first commit.

## Decisions (HITL)

| #   | Decision | Options | Status | Date |
| --- | --- | --- | --- | --- |
| D1  | Visual theme: **neon arcade-modern** (classic layout, glow effects) vs retro 8-bit vs flat | neon / retro / flat | **accepted** (user) | 2026-10-04 |
| D2  | Direction claiming: **open claim, first press wins; leftovers auto-assigned to players with fewest directions (join order tiebreak)** | open+auto / round-robin / fixed | **accepted** (user) | 2026-10-04 |
| D3  | Sound: **WebAudio synthesized retro SFX**, no audio assets | webaudio / silent | **accepted** (user) | 2026-10-04 |
| D4  | Leaderboard: **one team entry per game** (score + player names + level) | team / individual | **accepted** (user) | 2026-10-04 |
| D5  | Stack: Bun-only, vanilla TS + Canvas, no frameworks/deps | bun+vanilla / bun+react / node+express | **accepted** (agent proposal, aligns with user's "use bun") | 2026-10-04 |
| D6  | DB: SQLite via `bun:sqlite`, file `data/pacman.db`, WAL | sqlite / json file | **accepted** (agent proposal, user asked sqlite) | 2026-10-04 |
| D7  | Split release 1 into 4 features/specs: init, gameplay, multiplayer, leaderboard | one big spec / 4 specs | **accepted** (agent proposal) | 2026-10-04 |
| D19 | Game rAF loop deferred to 002 (shell keeps DOM-only screens); navigation singleton moved to `ui/nav.ts` + shared types extracted (`shared/api.ts`, `shared/app-info.ts`) per 001 review | defer / build placeholder loop now | **accepted** (review finding) | 2026-10-04 |

## Notes

- Release-1 scope guard: same-screen multiplayer only (no networking/websockets). Online
  multiplayer is a candidate for a future feature.
