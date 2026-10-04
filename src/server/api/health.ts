import type { HealthResponse } from "../../shared/api";
import { APP_NAME, APP_VERSION } from "../../shared/app-info";

export const healthRoute = {
  GET(): Response {
    const body: HealthResponse = {
      status: "ok",
      app: APP_NAME,
      version: APP_VERSION,
    };
    return Response.json(body);
  },
} as const;
