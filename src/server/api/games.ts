/** Games: team-score submission (transactional) + leaderboard queries. */
import type { Db } from "../db";
import {
  type LeaderboardEntry,
  type SubmitGameRequest,
  type SubmitGameResponse,
} from "../../shared/api";
import { DIRECTIONS, type Direction } from "../../shared/directions";

const MAX_SCORE = 10_000_000;
const DIRECTION_SET = new Set<string>(DIRECTIONS);

export type SubmitResult =
  | { ok: SubmitGameResponse }
  | { error: string };

function parsePlayers(raw: unknown): { userId: number; directions: Direction[] }[] | string {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 4) {
    return "players must be an array of 1-4 entries";
  }
  const seen = new Set<number>();
  const usedDirs = new Set<Direction>();
  const out: { userId: number; directions: Direction[] }[] = [];
  for (const p of raw) {
    const userId = (p as { userId?: unknown })?.userId;
    if (!Number.isInteger(userId) || (userId as number) <= 0) {
      return "player.userId must be a positive integer";
    }
    if (seen.has(userId as number)) return "duplicate player userId";
    seen.add(userId as number);
    const dirs = (p as { directions?: unknown })?.directions;
    if (!Array.isArray(dirs) || dirs.length < 1 || dirs.length > 4) {
      return "player.directions must be 1-4 entries";
    }
    const parsed: Direction[] = [];
    for (const d of dirs) {
      if (typeof d !== "string" || !DIRECTION_SET.has(d)) {
        return `invalid direction: ${String(d)}`;
      }
      if (usedDirs.has(d as Direction)) return `direction claimed twice: ${d}`;
      usedDirs.add(d as Direction);
      parsed.push(d as Direction);
    }
    out.push({ userId: userId as number, directions: parsed });
  }
  return out;
}

export function submitGame(db: Db, req: SubmitGameRequest): SubmitResult {
  const { teamScore, level, durationSec, players: rawPlayers } = req ?? ({} as SubmitGameRequest);
  if (!Number.isInteger(teamScore) || teamScore < 0 || teamScore > MAX_SCORE) {
    return { error: "teamScore must be an integer 0-10000000" };
  }
  if (!Number.isInteger(level) || level < 1 || level > 999) {
    return { error: "level must be an integer 1-999" };
  }
  if (!Number.isInteger(durationSec) || durationSec < 1 || durationSec > 86_400) {
    return { error: "durationSec must be an integer 1-86400" };
  }
  const players = parsePlayers(rawPlayers);
  if (typeof players === "string") return { error: players };

  // all referenced users must exist (FKs also enforce inside the transaction)
  for (const p of players) {
    const exists = db
      .query<{ id: number }, [number]>("SELECT id FROM users WHERE id = ?")
      .get(p.userId);
    if (!exists) return { error: `unknown userId ${p.userId}` };
  }

  const insert = db.transaction((rows: typeof players) => {
    const res = db
      .query(
        "INSERT INTO games (team_score, level, players_count, duration_sec) VALUES (?, ?, ?, ?)",
      )
      .run(req.teamScore, req.level, rows.length, req.durationSec);
    const gameId = Number(res.lastInsertRowid);
    const stmt = db.query(
      "INSERT INTO game_players (game_id, user_id, directions) VALUES (?, ?, ?)",
    );
    for (const p of rows) stmt.run(gameId, p.userId, JSON.stringify(p.directions));
    return gameId;
  });

  try {
    const gameId = insert(players) as unknown as number;
    const row = db
      .query<{ rank: number }, [number]>(
        `SELECT (SELECT COUNT(*) FROM games WHERE team_score > g.team_score)
              + (SELECT COUNT(*) FROM games WHERE team_score = g.team_score AND id < g.id)
              + 1 AS rank
         FROM games g WHERE g.id = ?`,
      )
      .get(gameId);
    return { ok: { gameId, rank: row?.rank ?? 1 } };
  } catch (err) {
    // constraint violations are client errors; anything else is a server fault
    if (err instanceof Error && /constraint|unique|foreign key/i.test(err.message)) {
      return { error: "invalid game data" };
    }
    throw err;
  }
}

interface GameRow {
  id: number;
  team_score: number;
  level: number;
  players_count: number;
  created_at: string;
}

interface PlayerRow {
  game_id: number;
  name: string;
  directions: string;
}

export function getLeaderboard(db: Db, limit = 10): LeaderboardEntry[] {
  const capped = Math.min(Math.max(1, Math.floor(limit)), 50);
  const games = db
    .query<GameRow, [number]>(
      "SELECT id, team_score, level, players_count, created_at FROM games ORDER BY team_score DESC, id ASC LIMIT ?",
    )
    .all(capped);
  if (games.length === 0) return [];
  const ids = games.map((g) => g.id);
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .query<PlayerRow, [number, ...number[]]>(
      `SELECT gp.game_id, u.name, gp.directions
       FROM game_players gp JOIN users u ON u.id = gp.user_id
       WHERE gp.game_id IN (${placeholders}) ORDER BY gp.user_id ASC`,
    )
    .all(...(ids as [number, ...number[]]));
  const byGame = new Map<number, LeaderboardEntry["players"]>();
  for (const r of rows) {
    const list = byGame.get(r.game_id) ?? [];
    let directions: string[] = [];
    try {
      directions = JSON.parse(r.directions) as string[];
    } catch {
      directions = [];
    }
    list.push({ name: r.name, directions: directions as Direction[] });
    byGame.set(r.game_id, list);
  }
  return games.map((g) => ({
    gameId: g.id,
    teamScore: g.team_score,
    level: g.level,
    playersCount: g.players_count,
    createdAt: g.created_at,
    players: byGame.get(g.id) ?? [],
  }));
}

export function postGameHandler(db: Db) {
  return async (req: Request): Promise<Response> => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    const result = submitGame(db, body as SubmitGameRequest);
    if ("error" in result) return Response.json(result, { status: 400 });
    return Response.json(result.ok, { status: 201 });
  };
}

export function getLeaderboardHandler(db: Db) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const raw = url.searchParams.get("limit");
    const limit = raw === null || raw === "" ? 10 : Number(raw);
    return Response.json(getLeaderboard(db, Number.isFinite(limit) ? limit : 10));
  };
}
