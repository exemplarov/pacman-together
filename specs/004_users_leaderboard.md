# 004 — Persistent Users & Team Leaderboard (SQLite)

Status: **implemented** (browser run pending)

## Idea

Players get a lightweight persistent identity (name → user row in SQLite). Every finished
game is recorded as **one team entry** (D4): team score, level reached, players with their
claimed directions, duration. Leaderboard screen (top teams) reachable from attract and
shown after game over; simple per-user profile stats.

## Research

- **bun:sqlite** — synchronous API; `db.query()` returns cached prepared statements;
  parameters bound positionally; `RETURNING *` supported; WAL via `PRAGMA journal_mode=WAL`.
  https://bun.com/docs/runtime/sqlite
- **Bun routes** — per-method handlers (`GET`/`POST`) on `Bun.serve({routes})`; `req.json()`
  for bodies; `Response.json()` for output. https://bun.com/docs/runtime/http/server
- SQLite `COLLATE NOCASE` + `UNIQUE` for case-insensitive username uniqueness;
  ISO 8601 timestamp strings simplest and sortable.

## Design / Problem brainstorm

**Problem: multiple local players share one browser — how to persist identities?**
Options: (a) full auth — overkill; (b) name-based upsert, no passwords: on join, player
types/confirms a name; `POST /api/users {name}` upserts and returns the user; the client
remembers the *last used* name per browser in localStorage as a convenience prefill for
slot 1 only. ✅ (b). Names are display identities, not secrets (documented limitation).

**Problem: leaderboard semantics for co-op.** One row per game (team entry, D4) with
players in a child table for querying "games containing user X". Rank by
`team_score DESC, created_at ASC` (earlier wins ties). Derived profile stats:
best team score, games played, sum of team scores ("total co-op points").

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS games (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_score    INTEGER NOT NULL,
  level         INTEGER NOT NULL,
  players_count INTEGER NOT NULL,
  duration_sec  INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS game_players (
  game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  directions TEXT NOT NULL,             -- JSON array: ["left","up"]
  PRIMARY KEY (game_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_games_score ON games(team_score DESC);
CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);
```

**API:**

- `POST /api/users` `{name}` → upsert, returns `{id, name}`. Validate: trim, 1–16 chars,
  printable; reject otherwise (400).
- `GET /api/users/:id` → profile `{id, name, gamesPlayed, bestTeamScore, totalPoints}`.
- `POST /api/games` `{teamScore, level, durationSec, players:[{userId, directions[]}]}` →
  inserts game + players in a transaction; validates bounds (score ≥ 0 ≤ 10⁷, level 1–999,
  duration 1–86400, 1–4 players, directions ⊆ {up,down,left,right}, non-empty, disjoint).
  Returns created game id + rank.
- `GET /api/leaderboard?limit=` (default 10, max 50) → rows `{rank, teamScore, level,
  playersCount, createdAt, players:[{name, directions}]}`.

**Problem: when to write the game row.** On game over only (not per level) — matches arcade
"run" semantics. Client shows "saving…" then rank ("#7 on the leaderboard!") — small
motivation hook.

**UI:** Leaderboard screen = neon table, top-10 default, gold/silver/bronze rank badges,
names white. Accessible from attract ("L" key / Leaderboard button) and from the game-over
screen. Profile widget in lobby after name confirm (best score line).

## Plan

- [x] `src/server/db.ts` — openDb (env `DB_PATH`, default `data/pacman.db`), WAL, FKs on,
      migrations; `initDb` reusable for `:memory:` tests.
- [x] `src/server/api/users.ts` — validateName, upsertUser (NOCASE), getUserProfile
      (games/best/total), POST/GET handlers.
- [x] `src/server/api/games.ts` — submitGame (full validation, transaction, insert-time
      rank via score DESC + id ASC), getLeaderboard (limit 1-50, players joined).
- [x] `src/shared/api.ts` — request/response contract types (+ HealthResponse).
- [x] Client: name inputs in lobby (typing-safe input handling in InputSystem),
      localStorage last-name prefill for slot 1, upsert-on-launch, game-over submission
      with rank line / offline fallback, LeaderboardScreen (15 entries, medals,
      dir glyphs, date), L key + button entries.
- [x] Tests: validateName, upsert idempotence (case), submit validation (score/level/
      duration/players/directions/dupes/unknown user), rank math (insert-time + final
      order), leaderboard assembly & limit, profile aggregation. End-to-end API verified
      manually against a live server (see commit notes).
- [x] Manual checklist below — server parts verified; client flow pending browser run.

## Decisions (HITL)

| #   | Decision | Status | Date |
| --- | --- | --- | --- |
| D4  | Team entry per game (not per player) | **accepted** (user) | 2026-10-04 |
| D16 | Identity = name upsert, no auth; localStorage prefill convenience only | **accepted** (agent; documented limitation) | 2026-10-04 |
| D17 | Rank = team_score DESC, created_at ASC; top-10 default view | **accepted** (agent) | 2026-10-04 |
| D18 | Game row written once at game over; level + duration + per-player directions stored | **accepted** (agent) | 2026-10-04 |
| D31 | Leaderboard shortcut is **B** (not L — L is IJKL's RIGHT key and collides); board back-keys ESC/B/Enter/button | **accepted** (review 004 #1) | 2026-10-04 |
| D32 | Names captured live via input listeners (phase re-renders destroy the fields); Enter blurs | **accepted** (review 004 #2) | 2026-10-04 |
| D33 | Duplicate names (case-insensitive) auto-suffixed `-2`/`-3`… client-side before upsert (server rejects duplicate user in one game) | **accepted** (review 004 #3) | 2026-10-04 |
| D34 | Score submission guarded by run-generation token (R-restart race); runTicks counts `playing` ticks only | **accepted** (review 004 #4/#5) | 2026-10-04 |
| D35 | upsertUser uses `ON CONFLICT DO NOTHING` + reselect; submit maps only constraint errors to 400 (others rethrow → 500) | **accepted** (review 004 #6/#7) | 2026-10-04 |
| D36 | InputSystem ownership: lobby disposes it on unmount unless handed off to GameScreen (`handedOff`) | **accepted** (review 004 #8) | 2026-10-04 |
| D37 | Lobby profile widget (best-score line via GET /api/users/:id) deferred to a follow-up feature; endpoint stays | **accepted** (agent, review 004 #9) | 2026-10-04 |

## Manual playtest checklist

- [ ] Same name (any case) re-joins → same user id; leaderboard shows the name once.
- [ ] Invalid names rejected (empty, >16, control chars); invalid game payloads rejected.
- [ ] Game over saves; rank shown; leaderboard updated; ordering correct with ties.
- [ ] Profile stats correct after 2–3 games.
- [ ] Server restart keeps data (file DB, WAL).
