/** Users: name upsert + profile stats. */
import type { Db } from "../db";
import type { UserResponse, UserProfileResponse } from "../../shared/api";

/** Validate a display name: trimmed, 1-16 chars, printable ASCII (arcade font). */
export function validateName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (name.length < 1 || name.length > 16) return null;
  if (!/^[\x20-\x7e]+$/.test(name)) return null;
  return name;
}

export function upsertUser(db: Db, name: string): UserResponse {
  // atomic upsert: safe even with multiple connections (review 004 #7)
  db.query("INSERT INTO users (name) VALUES (?) ON CONFLICT(name) DO NOTHING").run(name);
  const created = db
    .query<UserResponse, [string]>("SELECT id, name FROM users WHERE name = ?")
    .get(name);
  if (!created) throw new Error("user insert failed");
  return created;
}

interface ProfileRow {
  gamesPlayed: number;
  bestTeamScore: number;
  totalPoints: number;
}

export function getUserProfile(db: Db, id: number): UserProfileResponse | null {
  const user = db
    .query<UserResponse, [number]>("SELECT id, name FROM users WHERE id = ?")
    .get(id);
  if (!user) return null;
  const stats = db
    .query<ProfileRow, [number]>(
      `SELECT COUNT(*) AS gamesPlayed,
              COALESCE(MAX(g.team_score), 0) AS bestTeamScore,
              COALESCE(SUM(g.team_score), 0) AS totalPoints
       FROM game_players gp JOIN games g ON g.id = gp.game_id
       WHERE gp.user_id = ?`,
    )
    .get(id);
  return {
    id: user.id,
    name: user.name,
    gamesPlayed: stats?.gamesPlayed ?? 0,
    bestTeamScore: stats?.bestTeamScore ?? 0,
    totalPoints: stats?.totalPoints ?? 0,
  };
}

export function postUserHandler(db: Db) {
  return async (req: Request): Promise<Response> => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    const name = validateName((body as { name?: unknown })?.name);
    if (!name) {
      return Response.json(
        { error: "name must be 1-16 printable characters" },
        { status: 400 },
      );
    }
    return Response.json(upsertUser(db, name), { status: 201 });
  };
}

export function getUserHandler(db: Db) {
  return async (req: Request): Promise<Response> => {
    const id = Number((req as Request & { params?: { id?: string } }).params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "invalid id" }, { status: 400 });
    }
    const profile = getUserProfile(db, id);
    if (!profile) return Response.json({ error: "user not found" }, { status: 404 });
    return Response.json(profile);
  };
}
