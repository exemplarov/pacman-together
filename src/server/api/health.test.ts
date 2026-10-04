import { expect, test } from "bun:test";
import { healthRoute } from "./health";

test("GET /api/health returns ok payload", async () => {
  const res = healthRoute.GET();
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string; app: string; version: string };
  expect(body.status).toBe("ok");
  expect(body.app).toBe("pacman-together");
  expect(typeof body.version).toBe("string");
});
