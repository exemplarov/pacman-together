import { serve } from "bun";
import { healthRoute } from "./api/health";
import { postUserHandler, getUserHandler } from "./api/users";
import { postGameHandler, getLeaderboardHandler } from "./api/games";
import { openDb } from "./db";
import index from "../client/index.html";

const port = (() => {
  const p = Number(process.env.PORT ?? 3000);
  return Number.isInteger(p) && p > 0 && p < 65536 ? p : 3000;
})();

const db = openDb();

export const routes = {
  "/": index,
  "/api/health": healthRoute,
  "/api/users": { POST: postUserHandler(db) },
  "/api/users/:id": { GET: getUserHandler(db) },
  "/api/games": { POST: postGameHandler(db) },
  "/api/leaderboard": { GET: getLeaderboardHandler(db) },
} as const;

const server = serve({
  port,
  routes,
  development: process.env.NODE_ENV !== "production",
  fetch() {
    return new Response("Not Found", { status: 404 });
  },
  error(error) {
    console.error(error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  },
});

console.log(`pacman-together listening on ${server.url}`);
