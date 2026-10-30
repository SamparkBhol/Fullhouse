import { createQloo, findVenues } from "../core/index.ts";
import { createApp } from "./app.ts";
import type { Env } from "./env.ts";
import { FACE_WOFF2 } from "./font.ts";
import { meterStub, scanStub, statsStub } from "./venue_agent.ts";
import type { VenueApi } from "./venue/api.ts";

export { Meter } from "./meter.ts";
export { VenueAgent } from "./venue_agent.ts";

const app = createApp({
  createQloo,
  findVenues,
  venue: (env, id) => env.VENUE.get(env.VENUE.idFromName(id)) as unknown as VenueApi,
  meter: meterStub,
  stats: statsStub,
  scans: scanStub,
  font: FACE_WOFF2,
});

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
