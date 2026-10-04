/**
 * API facade — works with or without the backend (D38).
 * Online: the Bun server (users/games/leaderboard).
 * Offline: per-browser localStorage leaderboard via localBoard.
 * The mode is probed once per page load; only *network* failures (or 5xx)
 * flip the session to offline — 4xx means "our payload was invalid", reported as null.
 */
import type {
  LeaderboardEntry,
  SubmitGameRequest,
  SubmitGameResponse,
  UserResponse,
} from "../../shared/api";
import { APP_NAME } from "../../shared/app-info";
import {
  addLocalGame,
  loadBoard,
  nextLocalUserId,
  rankOf,
  topEntries,
} from "./localBoard";

export type ApiMode = "online" | "offline";

export type SubmitOutcome = SubmitGameResponse & { local: boolean };

/** Display info for the local leaderboard (names aren't in the server request). */
export interface PlayerDisplay {
  name: string;
  directions: string[];
}

let modePromise: Promise<ApiMode> | null = null;

async function detectMode(): Promise<ApiMode> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch("/api/health", { signal: controller.signal });
    if (!res.ok) return "offline";
    const body = (await res.json()) as { app?: string };
    return body.app === APP_NAME ? "online" : "offline";
  } catch {
    return "offline";
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves (and caches) the current mode: server-backed or local-only. */
export function currentMode(): Promise<ApiMode> {
  modePromise ??= detectMode();
  return modePromise;
}

function markOffline(): void {
  modePromise = Promise.resolve("offline");
}

const localUser = (name: string): UserResponse => ({ id: nextLocalUserId(), name });

export async function apiUpsertUser(name: string): Promise<UserResponse | null> {
  if ((await currentMode()) === "offline") return localUser(name);
  let res: Response;
  try {
    res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
  } catch {
    markOffline();
    return localUser(name);
  }
  if (res.ok) {
    try {
      return (await res.json()) as UserResponse;
    } catch {
      // unparsable success body — treat like a server fault
    }
  }
  if (res.status >= 500) {
    markOffline();
    return localUser(name);
  }
  return null; // 4xx: invalid payload (e.g. name) — caller tolerates a missing identity
}

export async function apiSubmitGame(
  req: SubmitGameRequest,
  display?: PlayerDisplay[],
): Promise<SubmitOutcome | null> {
  const submitLocal = (): SubmitOutcome => {
    const entry = addLocalGame({
      teamScore: req.teamScore,
      level: req.level,
      players:
        display?.map((p) => ({ name: p.name, directions: p.directions })) ??
        req.players.map((p) => ({ name: `player ${p.userId}`, directions: p.directions })),
    });
    return { gameId: entry.gameId, rank: rankOf(loadBoard(), entry), local: true };
  };

  if ((await currentMode()) === "offline") return submitLocal();

  let res: Response;
  try {
    res = await fetch("/api/games", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch {
    markOffline();
    return submitLocal();
  }
  if (res.ok) {
    try {
      const body = (await res.json()) as SubmitGameResponse;
      return { ...body, local: false };
    } catch {
      // fall through to the 5xx path
    }
  }
  // 5xx → server trouble, degrade locally; 4xx → our payload is invalid, report failure
  if (res.status >= 500) {
    markOffline();
    return submitLocal();
  }
  return null;
}

export async function apiLeaderboard(limit = 10): Promise<LeaderboardEntry[] | null> {
  if ((await currentMode()) === "offline") {
    return topEntries(limit);
  }
  try {
    const res = await fetch(`/api/leaderboard?limit=${limit}`);
    if (res.ok) {
      const entries = (await res.json()) as LeaderboardEntry[];
      if (Array.isArray(entries)) return entries;
    }
  } catch {
    // network gone → fall through to local
  }
  markOffline();
  return topEntries(limit);
}
