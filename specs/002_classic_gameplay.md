# 002 — Classic Pacman Gameplay (Solo Core)

Status: **planned**

## Idea

Implement the complete classic Pacman game loop — authentic 28×31 maze, dots & energizers,
Pacman movement with turn buffering, four ghosts with dossier-accurate AI (scatter/chase/
frightened, house exits, tunnel rules), levels, scoring, lives, death/level-clear flow —
rendered with the neon arcade-modern look (D1) and WebAudio SFX (D3). Playable solo
(single player owns all 4 directions). Multiplayer input and lobby come in 003.

## Research

All mechanics from the Pac-Man Dossier (canonical, ROM-verified):

- **Grid**: 8px tiles; screen 28×36 tiles; maze 28×31. 240 dots + 4 energizers (244 total).
  https://pacman.holenet.info/
- **Ghost modes**: scatter/chase alternate on a fixed schedule; frightened interrupts and
  pauses the schedule. Mode changes (to frightened, scatter↔chase) force direction reversal;
  ghosts never voluntarily reverse. Scatter targets: Blinky top-right, Pinky top-left,
  Inky bottom-right, Clyde bottom-left (fixed unreachable tiles → ghosts circle their corner).
- **Chase targets**: Blinky = Pacman tile. Pinky = 4 tiles ahead of Pacman (up = 4 up + 4 left
  overflow bug — replicate for authenticity, noted in code). Inky = vector from Blinky to
  (2 tiles ahead of Pacman, with same up-bug) doubled. Clyde = Pacman if >8 tiles away
  (Euclidean), else his scatter corner.
- **Decision rule**: when a ghost enters a tile, it picks the legal next direction (not
  reverse) minimizing Euclidean distance to target; tie-break priority up>left>down>right.
  Frightened: pseudo-random direction at each tile (we use Math.random — determinism not
  needed).
- **Red zones**: two rows (12 & 26 area, x∈[12,15]) where ghosts may not choose UP (except
  frightened/eyes).
- **Tunnel**: row 14 wraps; ghosts slowed to ~40–50% inside tunnel; Pacman immune.
- **House logic**: ghosts exit staggered (dot counters: Blinky starts outside; Pinky ~0,
  Inky 30, Clyde 60 on L1 — simplify to time+dot hybrid). Eaten ghosts become eyes, path
  to house (target = door tile), re-enter, revive, exit again. Eyes ignore red zones and
  move fast.
- **Speeds** (% of max 75.75 px/s ≈ 9.47 tiles/s):
  - L1: pac 80, pac-fright 90, ghost 75, ghost-fright 50, tunnel 40
  - L2-4: pac 90, fright 95, ghost 85, fright 55, tunnel 45
  - L5+: pac 100, fright 100, ghost 95, fright 60, tunnel 50
- **Scatter/chase seconds**: L1: 7,20,7,20,5,20,5,∞ · L2-4: 7,20,7,20,5,1033,~0,∞ ·
  L5+: 5,20,5,20,5,1037,~0,∞.
- **Fright seconds by level**: 6,5,4,3,2,5,2,2,1,5,2,1,1,3,1,1,0,1,0,0… (we use this table,
  cycling last value; flash ~last 2s).
- **Scoring**: dot 10, energizer 50, ghosts 200/400/800/1600 per energizer chain, fruit at
  70 & 170 dots (L1 cherry 100, L2 strawberry 300, L3-4 orange 500, L5-6 apple 700,
  L7-8 melon 1000, … Galaxian 2000, bell 3000, keys 5000; stays ~9.5s), extra life at 10,000.
- **Cruise Elroy**: Blinky speeds up when dots remaining ≤ threshold (L1: 20 → +5%, 10 →
  +10%) and ignores scatter target (uses Pacman tile).

## Design / Problem brainstorm

**Maze representation.** Options: tile bitmask grid vs ASCII art rows. Chosen: 28-char ASCII
rows (`#` wall, `.` dot, `o` energizer, ` ` empty path, `-` door, `_` house interior, `T`
marks tunnel row implicitly by x<0/x>27 wrap on row 14). ASCII keeps the classic layout
reviewable in one screen and parseable in tests.

**Movement model.** Actors have pixel-precise positions; tile = floor(p/8). Turns only legal
when aligned within a cornering tolerance (~4px) on the perpendicular axis; classic Pacman
queues the desired direction (buffer) and turns at the next legal moment — including
*before* the intersection (pre-turn/cornering). Chosen: buffered desired direction +
snap-to-center on turn; ghosts always aligned (no cornering — authentic).

**Fixed timestep.** 60 Hz sim with accumulator; speeds expressed as tiles/tick
(e.g. 9.47 t/s ÷ 60). Sim state is plain mutable objects; renderer draws them each rAF.

**Wall rendering with neon look.** Options: (a) per-tile rounded rects — ugly seams;
(b) neighbor-aware line segments: for each wall tile draw edges only where the neighbor is
walkable, with rounded corners → double-stroke (outer glow via `shadowBlur`, inner bright
line) = neon tube look. Chosen: (b), pre-rendered once per level onto an offscreen canvas
(perf), with subtle per-level hue shift (L1 blue #2121de → hue-rotated).

**Ghost rendering.** Canvas-drawn classic silhouette (dome + wavy skirt, 2-frame wobble),
directional pupils, frightened = dark blue body + white face/pupils, flash to white in last
2s, eyes-only when eaten. Pacman = arc with animated mouth phase, rotates to direction;
death = widening mouth animation then pop.

**Fright chain UI.** Score popup (200/400/…) floats where ghost was eaten; brief 0.5s freeze
(authentic "eat pause" — pac & eaten ghost hidden, counter shows), then continue.

**State machine** (game scope): `attract → ready(2s) → playing → dying(1.5s) → (lives?
ready : gameover)` + `levelclear` (maze flash 2s). Level clear regenerates dots, resets
actors, level++. 002 wires attract→solo start via any-direction press; 003 replaces entry
flow with lobby.

**House exit simplification.** Authentic global/per-ghost dot counters + timer. Simplify:
Pinky exits after 2s, Inky after dotsEaten≥30 or 6s, Clyde after dotsEaten≥60 or 10s (per L1
counters; later levels scale thresholds down ×0.7^level min 0). Documented divergence —
keeps pacing feel without full counter subsystem. (Dossier-accurate version can be a future
tuning task.)

## Plan

- [ ] `src/client/game/constants.ts` — speeds/fright/scatter/fruit tables, colors, sizes.
- [ ] `src/client/game/maze.ts` — ASCII layout, parser, tile queries, dot/energizer counts,
      tunnel/red-zone/door/house geometry.
- [ ] `src/client/game/actors.ts` — Actor base (pos, dir, speed, desired-dir buffer,
      alignment, wall checks, tunnel wrap); Pacman (cornering, eat handling, death anim).
- [ ] `src/client/game/ghosts.ts` — ghost struct, mode scheduler, per-ghost targeting,
      decision-at-tile, frightened RNG, eyes return, house dwell/exit, Elroy, reversals.
- [ ] `src/client/game/engine.ts` — state machine, fixed-step update, collisions
      (pac×dot, pac×ghost w/ same-tile rule), score/lives/extra-life, fruit, level flow,
      events emitted for UI/audio.
- [ ] `src/client/game/render.ts` — offscreen maze layer w/ neon walls; actors, pellets
      glow, fruit, popups, banners (READY!, GAME OVER), HUD (score/hi-score/level/lives).
- [ ] `src/client/audio/sfx.ts` — WebAudio: chomp, energizer, siren loop (phases), eat-ghost,
      death, fruit, extra-life, level-clear; master mute toggle (M).
- [ ] `src/client/screens/game.ts` — canvas mount, rAF loop, attract overlay, pause (P),
      keyboard arrows/WASD temporarily map to solo-all-directions (003 generalizes input).
- [ ] Tests: maze counts (240/4, symmetric wrap rows), targeting math per ghost (fixed
      scenarios), schedule transitions, scoring incl. chain & extra life, fruit spawn
      triggers.
- [ ] Manual playtest checklist in this spec (below) — verify against dossier feel.

## Decisions (HITL)

| #   | Decision | Status | Date |
| --- | --- | --- | --- |
| D1  | Neon arcade-modern visuals (release-level decision) | **accepted** (user) | 2026-10-04 |
| D8  | Dossier-accurate ghost AI incl. Pinky/Inky up-bug replication | **accepted** (agent; authenticity ask) | 2026-10-04 |
| D9  | House exits: simplified hybrid timer+dot thresholds (documented divergence) | **accepted** (agent; propose dossier-exact as future tuning) | 2026-10-04 |
| D10 | Fright determinism dropped (Math.random instead of arcade PRNG) | **accepted** (agent) | 2026-10-04 |
| D11 | Fruit table full arcade list; despawn 9.5s | **accepted** (agent) | 2026-10-04 |

## Manual playtest checklist

- [ ] 240 dots + 4 energizers counted; dots render/eat correctly; level clears at 244.
- [ ] Cornering: buffered turn fires exactly at intersections; pre-turn feels snappy.
- [ ] Ghosts reverse on mode change & energizer; frightened lasts per-level table; flashing
      precedes end; chain scores 200→1600 with freeze-popups.
- [ ] Eyes return to house, revive, exit; ghosts slow in tunnel; wrap works for all actors.
- [ ] Ghosts never move up in red zones; Clyde orbits at ~8 tiles; Inky mirrors Blinky.
- [ ] Death anim → READY! → reset positions; 3 lives; extra life at 10k; GAME OVER flow.
- [ ] Level clear flash; speeds/fright times shift per table; fruit spawns at 70/170 dots.
- [ ] 60fps steady; no drift between sim & render; pause works (P); mute works (M).
