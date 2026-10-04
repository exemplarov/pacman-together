# 003 — Co-op Multiplayer: Lobby, Direction Claiming, Shared Control

Status: **implemented** (4-device browser playtest pending)

## Idea

Up to 4 local players join from keyboard clusters and/or gamepads, claim the directions they
are allowed to steer Pacman in (open claim, first press wins; leftovers auto-assigned — D2),
and then co-operatively control the single Pacman: a player's direction press only steers if
that direction belongs to them. Includes the lobby UX, direction pick screen, in-game
control strip, and disconnect handling.

## Research

- **Gamepad API** (MDN / W3C): `gamepadconnected` fires on first button press of a newly
  seen pad; state must be polled via `navigator.getGamepads()` every frame (objects are
  refreshed, don't cache). `mapping === "standard"` guarantees button indices: d-pad
  12=up, 13=down, 14=left, 15=right; axes[0/1] = left stick. Rumble via
  `gamepad.vibrationActuator.playEffect` (optional garnish).
  https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API
- **Standard gamepad layout**: https://www.w3.org/TR/gamepad/#remapping
- Local-multiplayer keyboard clustering convention (arrows / WASD / IJKL / numpad) used by
  browser party games; keeps 4 simultaneous keyboard players distinguishable.

## Design / Problem brainstorm

**Problem: distinguishing keyboard players on one keyboard.** Options: (a) any-key joins —
cannot tell who pressed what afterwards; (b) fixed clusters, each a virtual device —
join by pressing any key in the cluster, steering by cluster direction keys. ✅ (b).
Clusters: Arrows, WASD, IJKL, Numpad(8/4/5/6). Gamepads: any-button join; d-pad
(+ left stick, deadzone 0.5) steer; Start = confirm.

**Problem: claiming UX must be self-explanatory in seconds.** Design: pick screen shows a
big Pacman cross — four direction pads (UP/LEFT/RIGHT/DOWN cards). Live hint per joined
player card: "P2 — press one of your arrows to claim". Pressing a free direction on your
device claims it (card recolors to your player color, shows your initial/name). Pressing a
direction you already own = release (fix mistakes). Pressing an owned-by-other direction =
shake + "taken by P3" flash. When every player has ≥1 direction, a 20s countdown starts
(host can start sooner); on start/timeout, unclaimed directions auto-assign to players with
fewest directions, ties → join order. Solo player skips pick (auto all 4) with summary.

**Problem: shared steering fairness/authenticity.** Pacman keeps the classic buffered
desired-direction model; any player's legal press *overwrites* the buffer (last press wins).
A press is legal only if pressed direction ∈ player's claimed set. HUD strip under the maze
shows each player's color, name, and their arrows — arrow pulses when that player presses;
illegal presses give a subtle "denied" flicker on their card (no punishment).

**Problem: mid-game gamepad disconnect.** Auto-pause with overlay "P2 controller
disconnected — reconnect or press Q to convert directions to keyboard"; on reconnect within
lobby-joined identity, resume. Keyboard clusters can't disconnect.

**Problem: player colors must not clash with ghost/Pacman palette.** Player palette:
P1 `#ff4d6d` (neon red), P2 `#4dc9ff` (cyan), P3 `#b14dff` (violet), P4 `#7dff6d` (green).
Direction pads tinted with owner color; ghosts keep classic colors; Pacman stays yellow.

**Flow**: attract → lobby (join cards, name inputs — see 004) → pick → countdown/autoassign
→ summary + "press any direction to launch" → READY! → play. Game over → 004 submits team
score → leaderboard.

## Plan

- [x] `src/client/input/devices.ts` — InputSystem: keyboard clusters + gamepads, per-frame
      poll → edge events (dir/confirm/button/disconnect), d-pad buttons 12–15 + left stick
      (0.5 deadzone), keydown auto-repeat filtered, arrows/space scroll-prevented,
      `dispose()` for listener cleanup.
- [x] `src/client/input/session.ts` — Session: join (max 4, colors P1–P4), claim/release/
      taken, open-claim leftovers auto-assign (fewest-first, join-order tiebreak),
      solo-all, canSteer ownership filter, disconnect/reconnect/release-to-free (D14).
- [x] `src/client/screens/lobby.ts` — join UI (4 slots + hints per device type), pick
      cross (claim/release/taken feedback), 20s countdown once everyone has ≥1, instant
      finish when all 4 claimed, auto-assign, summary screen, launch.
- [x] `src/client/game/engine.ts` integration — ownership-filtered `pressDirection`
      (last press wins), control strip with pulse-on-press and deny flicker, disconnect
      auto-pause overlay with Q-release, ready overlay with team lineup.
- [x] Direction ownership passed to the game record for 004 (session persisted in
      GameScreen; submission lands with 004).
- [x] Tests: join limits/colors, claim/release/taken, auto-assign 2/1/1 + staggered
      counts + free-set interaction, canSteer incl. freed & disconnected, soloAll.
- [x] Manual playtest checklist (below) — logic verified by tests; full 4-device
      playtest pending browser session.

## Decisions (HITL)

| #   | Decision | Status | Date |
| --- | --- | --- | --- |
| D2  | Open claim + auto-assign leftovers (fewest directions first, join-order tiebreak); 20s countdown; solo auto-all | **accepted** (user) | 2026-10-04 |
| D12 | Keyboard clusters: Arrows / WASD / IJKL / Numpad8456 as 4 virtual devices | **accepted** (agent) | 2026-10-04 |
| D13 | Last-press-wins steering buffer; presses filtered by ownership; no punishment for illegal presses | **accepted** (agent) | 2026-10-04 |
| D14 | Auto-pause on gamepad disconnect mid-game; Q converts their directions to "free" (any keyboard cluster may steer them) | **accepted** (agent) | 2026-10-04 |
| D15 | Player colors P1 red / P2 cyan / P3 violet / P4 green | **accepted** (agent) | 2026-10-04 |
| D23 | Single `lobby.ts` screen with internal phases (lobby→pick→summary) instead of separate pick.ts — one rAF/input pipeline, less state hand-off | **accepted** (agent, implementation simplification) | 2026-10-04 |
| D24 | Attract screen replaced by the lobby itself (game entry always through a Session, even solo) — removes dual input paths in GameScreen | **accepted** (agent) | 2026-10-04 |
| D25 | InputSystem is created by the lobby and handed to GameScreen; GameScreen.unmount disposes it (window listener cleanup) | **accepted** (agent) | 2026-10-04 |
| D26 | Claim cap: while any player has 0 directions, others may not claim a 2nd (prevents all-4-grab deadlock; new `blocked` result with hint) | **accepted** (review 003 #9) | 2026-10-04 |
| D27 | Reconnect = any input on the disconnected device → revive + fresh READY beat; Q releases *all* disconnected players' directions; overlay lists every disconnected player | **accepted** (review 003 #1/#10) | 2026-10-04 |
| D28 | Keyboard hardening: `ev.repeat` filtered in screen handlers, preventDefault on repeats, `blur` clears held keys (alt-tab safe) | **accepted** (review 003 #4/#5/#6) | 2026-10-04 |
| D29 | Pad-first-press join: edges emitted for buttons already down on first sight; non-standard-mapped pads ignore d-pad indices (stick only) | **accepted** (review 003 #7/#16) | 2026-10-04 |
| D30 | Follow-ups logged: lobby phase machine not extracted for unit tests (DOM-coupled); countdown not reset when a player joins mid-pick; Escape no-op in pick | **accepted** (agent, deferred) | 2026-10-04 |

## Manual playtest checklist

- [ ] Join with 2 gamepads + 2 keyboard clusters; labels/colors correct; 5th device rejected
      gracefully.
- [ ] Claim/release/taken interactions behave; countdown only once everyone has ≥1.
- [ ] 3 players → auto-assign yields 2/1/1 to fewest-first; join-order tiebreak verifiable.
- [ ] In game, only owners can steer; strip pulses on press; buffer = last press.
- [ ] Disconnect mid-game pauses and resumes; Q-fallback works.
- [ ] Solo: skip pick, all four directions on arrows/WASD both.
