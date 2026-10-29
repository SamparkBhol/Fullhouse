import type { Qloo } from "../../core/index.ts";
import { isQlooError } from "../qloo/errors.ts";
import { recordEvent, type StatsSink } from "./events.ts";

const PATHS = new Set(["/search", "/v2/insights", "/v2/analysis/compare", "/v2/trending", "/entities"]);
const FILTER_TYPE = /^urn:[a-z_:]{1,40}$/;

// Insights answers differ by filter type, so each type is its own row; anything else keeps a fixed name.
export function endpointName(path: string, params: Record<string, string | string[]>): string {
  if (!PATHS.has(path)) return "other";
  const type = params["filter.type"];
  if (path === "/v2/insights" && typeof type === "string" && FILTER_TYPE.test(type)) return `${path} ${type}`;
  return path;
}

export function observeQloo(q: Qloo, sink: StatsSink): Qloo {
  return {
    ...q,
    async get(call, path, params) {
      const endpoint = endpointName(path, params);
      try {
        const res = await q.get(call, path, params);
        recordEvent(sink, { kind: "qloo_call", endpoint, cached: res.prov.cached, ms: res.prov.ms ?? 0 });
        return res;
      } catch (err) {
        recordEvent(sink, { kind: "qloo_error", endpoint, error: isQlooError(err) ? err.kind : "other" });
        throw err;
      }
    },
  };
}
