/** Thin API client — all calls fail soft (null) so the game works offline. */
import type {
  LeaderboardEntry,
  SubmitGameRequest,
  SubmitGameResponse,
  UserResponse,
} from "../../shared/api";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function apiUpsertUser(name: string): Promise<UserResponse | null> {
  return jsonFetch<UserResponse>("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function apiSubmitGame(req: SubmitGameRequest): Promise<SubmitGameResponse | null> {
  return jsonFetch<SubmitGameResponse>("/api/games", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
}

export function apiLeaderboard(limit = 10): Promise<LeaderboardEntry[] | null> {
  return jsonFetch<LeaderboardEntry[]>(`/api/leaderboard?limit=${limit}`);
}
