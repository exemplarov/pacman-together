import { serve } from "bun";
import { healthRoute } from "./api/health";
import index from "../client/index.html";

const port = (() => {
  const p = Number(process.env.PORT ?? 3000);
  return Number.isInteger(p) && p > 0 && p < 65536 ? p : 3000;
})();

export const routes = {
  "/": index,
  "/api/health": healthRoute,
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
