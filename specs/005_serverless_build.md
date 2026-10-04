# 005 — Serverless Static Build (distribute frontend without the backend)

Status: **implemented**

## Idea

Make the frontend distributable as plain static files (CDN/static host/even `file://`)
with no Bun server required. One build artifact works in both worlds: with the server
it uses the global SQLite leaderboard; without it, it gracefully degrades to a
per-browser localStorage leaderboard. Also ship a single self-contained HTML build and
a GitHub Pages workflow so the game is instantly playable online.

## Research

- **Bun static HTML builds** — `bun build ./index.html --minify --outdir=dist` bundles
  scripts/stylesheets/assets referenced by the HTML (zero config; our `./main.ts` +
  `./ui/style.css` are handled). Production build via Bun.build API or CLI.
  https://bun.com/docs/bundler/html-static
- **Standalone single-file HTML** — `bun build --compile --target=browser ./index.html`
  inlines ALL JS/CSS/images into one self-contained `.html` — works from `file://`
  (no ES-module CORS issues). https://bun.com/docs/bundler/standalone-html
- **Build-time env inlining** — `--env=inline` / `PUBLIC_*` prefix can compile flags
  into the bundle (the "build flag" alternative — rejected in favor of runtime
  detection, see D38).
- **Runtime capability detection** — probe an endpoint with a timeout + payload shape
  check; static hosts return 404/HTML for `/api/*`, `file://` fetch fails instantly.
- **GitHub Pages via Actions** — official pattern: build → `actions/upload-pages-artifact`
  → `actions/deploy-pages` (permissions `pages: write`, `id-token: write`).

## Design / Problem brainstorm

**Problem: one artifact or two (build flag)?** Options:
1. Build flag (env-inlined `PUBLIC_STATIC=1` swapping the API adapter at compile time) —
   two artifacts to keep in sync, deployment ambiguity.
2. ✅ **Runtime detection**: single build probes `/api/health` (2s timeout, verifies
   `app === "pacman-together"` to avoid foreign hosts answering) → `online | offline`,
   cached per page load. Network failure mid-session (server died) flips to offline for
   the rest of the session so score submission still saves locally.

**Problem: what does offline mode lose?** Global identity/leaderboard. Replacement:
localStorage-backed leaderboard mirroring the server contract (`localBoard.ts`):
entries `{teamScore, level, players[{name, directions}], createdAt}`, sorted
score DESC / earlier-first, capped at 100; synthetic negative user ids (unused for
display); rank computed with the same better + earlier-equal + 1 formula. UI badges:
leaderboard header "THIS BROWSER", game-over rank line "#N — LOCAL LEADERBOARD".

**Problem: storage access in unit tests.** `localBoard.ts` takes a storage interface
(`get`/`set`) defaulting to `localStorage`; tests inject an in-memory map (no DOM in
`bun test`).

**Problem: asset paths for subpath hosting (GitHub Pages `/repo/`).** The HTML bundler's
output URL shape must be verified; `scripts/build.ts` post-processes `dist/index.html`
rewriting any absolute asset URLs to relative so the build works at any base path.

**Server unchanged** — dev/fullstack flow stays exactly as-is; the static build is an
additional distribution format.

## Plan

- [x] `src/client/ui/localBoard.ts` — injectable-storage local leaderboard (add/rank/
      top/cap) + tests.
- [x] `src/client/ui/api.ts` — facade: mode probe (`/api/health`, 2s timeout, shape
      check, cached; `markOffline()` on network failure), online = existing fetches,
      offline = localBoard; `apiLeaderboard` works in both; submit returns `local` flag.
- [x] `LeaderboardScreen` — mode badge (SERVER / THIS BROWSER).
- [x] `GameScreen` — "#N — LOCAL LEADERBOARD" variant when saved locally.
- [x] `scripts/build.ts` — Bun.build: `dist/` (minified) + `dist-single/pacman-together.html`;
      relative-path post-processing; prints artifact sizes. Single file built by our own
      inliner (see D43).
- [x] `package.json` scripts (`build`, `build:dist`, `build:single`); `.gitignore`
      `dist/`, `dist-single/`.
- [x] `.github/workflows/pages.yml` — on push master: install, typecheck, test, build,
      deploy `dist/` to GitHub Pages.
- [x] README distribution section.
- [x] Verified: `bun run build` outputs; `dist/index.html` asset URLs relative (already
      relative — post-processor kept as a safety net); single file has inline JS+CSS,
      no external local refs.

## Decisions (HITL)

| #   | Decision | Status | Date |
| --- | --- | --- | --- |
| D38 | Runtime detection (single artifact); probe cached per page load; mid-session network failure flips to offline | **accepted** (user) | 2026-10-04 |
| D39 | `bun run build` produces BOTH `dist/` folder and `dist-single/pacman-together.html` | **accepted** (user) | 2026-10-04 |
| D40 | Offline keeps a full experience: localStorage leaderboard (cap 100), synthetic ids, UI badges | **accepted** (user) | 2026-10-04 |
| D41 | GitHub Pages workflow (build + test + deploy on push to master) | **accepted** (user) | 2026-10-04 |
| D42 | Build script post-processes asset URLs to relative (subpath-safe hosting) | **accepted** (agent) | 2026-10-04 |
| D43 | `Bun.build({compile, target:"browser"})` is broken in Bun 1.3.9 on Windows ("No entry point found for compilation", fails on a minimal repro) → single-file artifact produced by our own inliner (inline the dist JS/CSS into the HTML); revisit when Bun fixes standalone compile | **accepted** (agent, workaround) | 2026-10-04 |
| D44 | Review 005: `apiUpsertUser` mirrors the 4xx/5xx split (only network/5xx degrade to offline; 4xx → null identity); lobby sanitizes names client-side (printable ASCII ≤16, suffix keeps limit) so a 400 is unreachable from normal input | **accepted** (review 005 #1) | 2026-10-04 |
| D45 | Review 005 hardening: inliner loops all matches + escapes `</script`/`</style` + asserts no local refs remain; loadBoard shape-guards entries; leaderboard mode chip re-reads mode after fetch; submitScore try/catch; pinned typescript devDep; `build:single` script removed (broken per D43); probe timer in finally | **accepted** (review 005 #2-#12) | 2026-10-04 |
