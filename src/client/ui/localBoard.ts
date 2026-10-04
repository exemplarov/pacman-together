/** Offline leaderboard backed by injectable storage (localStorage in the browser). */
import type { LeaderboardEntry } from "../../shared/api";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

class MemoryStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

export const BOARD_KEY = "pacman-together.local-board";
export const ID_KEY = "pacman-together.local-user-seq";
const MAX_ENTRIES = 100;

/** Entry shape as persisted locally (same fields the server returns). */
export type LocalEntry = LeaderboardEntry;

function browserStorage(): KeyValueStorage {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // some contexts block storage access
  }
  return new MemoryStorage();
}

function isEntry(e: unknown): e is LocalEntry {
  if (typeof e !== "object" || e === null) return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.gameId === "number" &&
    typeof o.teamScore === "number" &&
    typeof o.level === "number" &&
    typeof o.playersCount === "number" &&
    typeof o.createdAt === "string" &&
    Array.isArray(o.players) &&
    o.players.every(
      (p) =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as Record<string, unknown>).name === "string" &&
        Array.isArray((p as Record<string, unknown>).directions),
    )
  );
}

export function loadBoard(storage: KeyValueStorage = browserStorage()): LocalEntry[] {
  try {
    const raw = storage.getItem(BOARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry); // drop corrupted/hand-edited entries (review 005 #4)
  } catch {
    return [];
  }
}

function saveBoard(board: LocalEntry[], storage: KeyValueStorage): void {
  storage.setItem(BOARD_KEY, JSON.stringify(board));
}

/** Rank among the board: strictly better + earlier equal + 1 (matches the server). */
export function rankOf(board: LocalEntry[], entry: LocalEntry): number {
  let rank = 1;
  for (const e of board) {
    if (e === entry) continue;
    if (e.teamScore > entry.teamScore) rank++;
    else if (e.teamScore === entry.teamScore && e.gameId < entry.gameId) rank++;
  }
  return rank;
}

export interface AddGameInput {
  teamScore: number;
  level: number;
  players: { name: string; directions: string[] }[];
}

/** Insert a finished game; returns the created entry (with local rank semantics). */
export function addLocalGame(
  input: AddGameInput,
  storage: KeyValueStorage = browserStorage(),
): LocalEntry {
  const board = loadBoard(storage);
  const nextId = board.reduce((m, e) => Math.max(m, e.gameId), 0) + 1;
  const entry: LocalEntry = {
    gameId: nextId,
    teamScore: input.teamScore,
    level: input.level,
    playersCount: input.players.length,
    createdAt: new Date().toISOString(),
    players: input.players.map((p) => ({
      name: p.name,
      directions: p.directions as LocalEntry["players"][number]["directions"],
    })),
  };
  // keep sorted: score desc, insertion order asc (monotonic ids)
  board.push(entry);
  board.sort((a, b) => b.teamScore - a.teamScore || a.gameId - b.gameId);
  saveBoard(board.slice(0, MAX_ENTRIES), storage);
  return entry;
}

/** Next synthetic (negative) user id for offline identity. */
export function nextLocalUserId(storage: KeyValueStorage = browserStorage()): number {
  const raw = Number(storage.getItem(ID_KEY) ?? "0");
  const n = Number.isFinite(raw) ? raw + 1 : 1;
  storage.setItem(ID_KEY, String(n));
  return -n;
}

/** Top entries for display. */
export function topEntries(
  limit: number,
  storage: KeyValueStorage = browserStorage(),
): LocalEntry[] {
  return loadBoard(storage).slice(0, Math.max(1, limit));
}
