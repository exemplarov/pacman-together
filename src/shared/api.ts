/** API contract types shared between server handlers and client fetch calls. */

export interface HealthResponse {
  status: "ok";
  app: string;
  version: string;
}
