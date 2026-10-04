# AGENTS.md — Project Workflow & Conventions

This file describes how work is done in this repository. Follow it for every feature.

## Project

**Pacman Together** — a browser-based, classic Pacman 2D game with a co-op twist: up to 4
local players (keyboard + gamepads) all control the *same* Pacman, but each player is only
allowed to steer in the direction(s) they claimed in the lobby (e.g. 4 players = 1 direction
each; 3 players = one player takes 2; 1 player = all 4).

- **Backend:** Bun (`Bun.serve`, `bun:sqlite`) — no external frameworks.
- **Frontend:** TypeScript + Canvas 2D, bundled by Bun's HTML imports. No framework.
- **Persistence:** SQLite (`data/pacman.db`) — users + games + leaderboard.

## Feature workflow (per feature)

1. **Research first.** Before designing, research the domain online (web search) and
   summarize the findings (with links) in the feature spec. Do not design from memory alone
   for well-documented domains (e.g. Pacman mechanics — use the Pac-Man Dossier).
2. **Write the feature doc:** `specs/NNN_slug.md` containing, in order:
   - **Idea** — what and why, short.
   - **Research** — links + key facts found online.
   - **Design / Problem brainstorm** — approaches considered, problems, trade-offs.
   - **Plan** — concrete implementation steps (tasks checklist).
   - **Decisions (HITL)** — decision log. This is a *living section*: ask the user via the
     question tool, record each decision with status (`proposed` / `accepted` / `rejected` /
     `superseded`) and date. Update it whenever a decision changes.
3. **HITL gate:** confirm key decisions with the user before implementing.
4. **Implement** following the plan. Keep the code style consistent with the rest of the repo.
5. **Code review in a subagent:** spawn a fresh `general` subagent to review the diff/files
   (correctness, edge cases, style, spec compliance). Address its findings.
6. **Commit** (`feat(scope): ...`, `fix(scope): ...`, `docs(specs): ...`, one commit per
   feature minimum). Then proceed to the next feature.

Specs are living documents — update them when reality diverges from the plan (and note why in
the decision log).

## Conventions

- **Runtime:** Bun only (scripts, server, bundler, test runner via `bun test`).
- **Language:** TypeScript, strict mode, everywhere (client + server).
- **No external dependencies** unless a decision in a spec says otherwise.
- **Server layout:** `src/server/` (HTTP + API + DB), `src/client/` (game + UI),
  `src/shared/` (types shared by both).
- **Game loop:** fixed-timestep simulation (60 Hz) driven by `requestAnimationFrame` with an
  accumulator; rendering reads mutable sim state directly (simple, sufficient for 2D).
- **Game state lives in the client**; the server only persists users/scores (no websockets in
  the first release — same-screen multiplayer only).
- **DB:** SQLite via `bun:sqlite`, WAL mode, file at `data/pacman.db` (gitignored).
- **Testing:** `bun test` for pure logic (maze parsing, ghost AI targeting, scoring, API
  handlers where practical). Manual playtest checklist goes in the spec.
- **Commits:** conventional-commit style, imperative mood.

## Commands

```bash
bun run dev      # start dev server (HMR) on http://localhost:3000
bun test         # run unit tests
bun run start    # production server
```
