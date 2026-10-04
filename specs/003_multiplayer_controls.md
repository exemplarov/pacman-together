# 003 — Co-op Multiplayer: Lobby, Direction Claiming, Shared Control

Status: **planned**

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

- [ ] `src/client/input/devices.ts` — device model: keyboard clusters + gamepads; per-frame
      poll → unified `DirectionPress {playerId, direction}` + `AnyPress` for join/confirm;
      edge detection (pressed-this-frame), d-pad + stick with deadzone.
- [ ] `src/client/input/manager.ts` — join tracking (join order, device label, color),
      connect/disconnect events, keyboard fallback for solo.
- [ ] `src/client/screens/lobby.ts` — join UI (device cards, up to 4, hints per device
      type), name field per player (004 persistence hooks in), start gate (host: Space or
      pad Start).
- [ ] `src/client/screens/pick.ts` — direction cross UI, claim/release/taken feedback,
      countdown, auto-assign leftovers rule, summary state, launch.
- [ ] `src/client/game/engine.ts` integration — input source filtered by ownership map;
      last-press-wins buffer; control strip component under canvas; pause on disconnect.
- [ ] Direction ownership persisted per game and passed to 004 for the score record.
- [ ] Tests: auto-assign distribution (3 players → 2/1/1, fewest-first, join-order ties),
      claim/release transitions, ownership filter logic.
- [ ] Manual playtest checklist (below).

## Decisions (HITL)

| #   | Decision | Status | Date |
| --- | --- | --- | --- |
| D2  | Open claim + auto-assign leftovers (fewest directions first, join-order tiebreak); 20s countdown; solo auto-all | **accepted** (user) | 2026-10-04 |
| D12 | Keyboard clusters: Arrows / WASD / IJKL / Numpad8456 as 4 virtual devices | **accepted** (agent) | 2026-10-04 |
| D13 | Last-press-wins steering buffer; presses filtered by ownership; no punishment for illegal presses | **accepted** (agent) | 2026-10-04 |
| D14 | Auto-pause on gamepad disconnect mid-game; Q converts their directions to "free" (any keyboard cluster may steer them) | **accepted** (agent) | 2026-10-04 |
| D15 | Player colors P1 red / P2 cyan / P3 violet / P4 green | **accepted** (agent) | 2026-10-04 |

## Manual playtest checklist

- [ ] Join with 2 gamepads + 2 keyboard clusters; labels/colors correct; 5th device rejected
      gracefully.
- [ ] Claim/release/taken interactions behave; countdown only once everyone has ≥1.
- [ ] 3 players → auto-assign yields 2/1/1 to fewest-first; join-order tiebreak verifiable.
- [ ] In game, only owners can steer; strip pulses on press; buffer = last press.
- [ ] Disconnect mid-game pauses and resumes; Q-fallback works.
- [ ] Solo: skip pick, all four directions on arrows/WASD both.
