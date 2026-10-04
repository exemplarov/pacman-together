/** API contract types shared between server handlers and client fetches. */
import type { Direction } from "./directions";

export interface HealthResponse {
  status: "ok";
  app: string;
  version: string;
}

export interface UserResponse {
  id: number;
  name: string;
}

export interface UserProfileResponse {
  id: number;
  name: string;
  gamesPlayed: number;
  bestTeamScore: number;
  totalPoints: number;
}

export interface SubmitGamePlayer {
  userId: number;
  directions: Direction[];
}

export interface SubmitGameRequest {
  teamScore: number;
  level: number;
  durationSec: number;
  players: SubmitGamePlayer[];
}

export interface SubmitGameResponse {
  gameId: number;
  rank: number;
}

export interface LeaderboardPlayer {
  name: string;
  directions: Direction[];
}

export interface LeaderboardEntry {
  gameId: number;
  teamScore: number;
  level: number;
  playersCount: number;
  createdAt: string;
  players: LeaderboardPlayer[];
}

export interface ApiError {
  error: string;
}
