import { createQloo } from "../../../src/core/qloo/client.ts";
import { createRunner } from "../../../src/core/street/runner.ts";
import { resolveVenue } from "../../../src/core/street/steps/resolve.ts";
import { NOW, VENUE, fakeFetch, streetRoute, type Route } from "../../fixtures/street.ts";

export function stepSetup(routes: Route[] = [], extra: Record<string, unknown> = {}) {
  const f = fakeFetch([...routes, streetRoute]);
  const q = createQloo({ apiKey: "step-key", fetch: f.fetch, now: () => NOW, sleep: async () => {}, ...extra });
  return { run: createRunner(q, 30, 3), ctx: resolveVenue(VENUE, NOW), calls: f.calls };
}

export function answer(match: (p: URLSearchParams, path: string) => boolean, body: unknown, status = 200): Route {
  return (url) => (match(url.searchParams, url.pathname) ? { status, body } : undefined);
}
