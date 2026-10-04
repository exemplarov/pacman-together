# Pacman Together

Classic Pacman with a co-op twist: **up to 4 players on one screen steer a single
Pacman — each player owns only the direction(s) they claimed.** Four players = one
direction each; three = one player takes two; solo = all four.

## Run

```bash
bun install
bun run dev        # http://localhost:3000  (fullstack: game + server leaderboard)
```

- `bun test` — unit tests · `bun run start` — production server
- SQLite data lives at `data/pacman.db` (auto-created; override with `DB_PATH`)

## Distribute without a server

```bash
bun run build
```

- **`dist/`** — static site (index.html + hashed JS/CSS, relative paths): drop it on any
  static host or CDN (Netlify, Vercel, Cloudflare Pages, GitHub Pages, an S3 bucket…).
- **`dist-single/pacman-together.html`** — the entire game in one self-contained file
  (~59 kB): double-click it, email it, host it anywhere. Plays offline (the arcade
  font falls back to system monospace when the font CDN is unreachable).

No backend? No problem — the app detects the missing server at boot and switches to
**local mode**: identities and a per-browser leaderboard are kept in localStorage (the
leaderboard screen shows a "this browser only" badge). The same build automatically uses
the global server leaderboard whenever the API is present.

A GitHub Actions workflow (`.github/workflows/pages.yml`) builds and publishes `dist/`
to GitHub Pages on every push to `master`.

## How to play

1. **Lobby** — each player joins by pressing any key on their device:
   - keyboard clusters: **ARROWS**, **WASD**, **IJKL**, **NUMPAD 8/4/5/6**
   - gamepads: press any button (d-pad + stick steer; Start/A confirm)
   - type a name (persistent identity, leaderboard)
2. **Claim directions** — press a direction *on your own device* to claim it
   (press again to release). When everyone has one, leftovers auto-assign to
   whoever has the fewest. 20s countdown; solo skips straight to the game.
3. **Play** — you may only steer the arrows you own. Last press wins.
   `P` pause · `M` mute · `B` leaderboard.

Lost a controller mid-game? The game auto-pauses — reconnect and press anything,
or press `Q` to release their directions to everyone.

## Mechanics

Authentic arcade rules (per the [Pac-Man Dossier](https://pacman.holenet.info/)):
28×31 maze with 240 dots + 4 energizers, scatter/chase schedules, the four ghost
personalities (including Pinky's and Inky's "up" overflow bug), frightened chain
scoring 200→1600, tunnel wrap & slowdown, ghost house exits, Cruise Elroy, fruit,
extra life at 10,000 — wrapped in a neon-arcade look with synthesized WebAudio SFX.

## Project layout

```
src/client/   game engine, renderer, screens, input, audio
src/server/   Bun.serve routes + bun:sqlite persistence
src/shared/   types shared by client & server
specs/        feature docs (idea → research → design → plan → decisions)
AGENTS.md     the development workflow used in this repo
```
