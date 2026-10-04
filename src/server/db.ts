/** SQLite setup: open, pragmas, migrations (schema in specs/004). */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";

export type Db = Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS games (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  team_score    INTEGER NOT NULL,
  level         INTEGER NOT NULL,
  players_count INTEGER NOT NULL,
  duration_sec  INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS game_players (
  game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  directions TEXT NOT NULL,
  PRIMARY KEY (game_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_games_score ON games(team_score DESC);
CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);
`;

/** Apply pragmas + migrations to a database (used for file and :memory: dbs). */
export function initDb(db: Db): void {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
}

/** Open (and create if needed) the app database. */
export function openDb(path = process.env.DB_PATH ?? "data/pacman.db"): Db {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  initDb(db);
  return db;
}
