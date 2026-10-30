import type { Hono } from "hono";
import type { ScanAnswer } from "../../shared/scan.ts";
import { BurstLimiter } from "../burst.ts";
import { apiError, bearer } from "../http.ts";
import { timingSafeEqual } from "../owner_token.ts";
import { ScanRecordSchema } from "../scan/schema.ts";
import type { ScanApi } from "../scan/store.ts";
import { parse } from "../validate.ts";
import { HttpError, json, readBody, refuseBurst, secretOf, type AppDeps, type AppEnv, type Ctx } from "./shared.ts";

const PER_MINUTE = 30;

export function scanRoutes(app: Hono<AppEnv>, deps: AppDeps): void {
  const publicBurst = new BurstLimiter(PER_MINUTE, 60_000);
  const adminBurst = new BurstLimiter(10, 60_000);

  function scans(c: Ctx): ScanApi {
    const api = deps.scans?.(c.env);
    if (!api) throw new HttpError(503, "stats_off", "This server keeps no stats.");
    return api;
  }

  // The scan script is the only writer: it posts one dated record of totals with the server's own secret.
  app.post("/api/admin/scan", async (c) => {
    const limited = await refuseBurst(c, adminBurst);
    if (limited) return limited;
    const secret = secretOf(c.env);
    const given = bearer(c.req.raw);
    if (!given || !timingSafeEqual(given, secret)) return apiError(401, "unauthorized", "Send the server's secret as a Bearer token.");
    const p = parse(ScanRecordSchema, await readBody(c));
    if (!p.ok) return apiError(400, "invalid_input", p.detail);
    await scans(c).putScan(p.value);
    return json({ stored: p.value.at }, 201);
  });

  app.get("/api/scan", async (c) => {
    const limited = await refuseBurst(c, publicBurst);
    if (limited) return limited;
    const body: ScanAnswer = { scan: await scans(c).latestScan() };
    return json(body, 200, { "cache-control": "no-cache" });
  });
}
