import type { Query } from "../params.ts";
import { between, round } from "../seed.ts";
import { workTypeOf } from "../world/media.ts";
import { invalid, ok, type Answer } from "./answer.ts";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

// The hackathon host's series holds flat, so every day repeats the same rank with zero velocity.
export function trending(q: Query): Answer {
  const type = q.one("filter.type") ?? "";
  const kind = workTypeOf(type);
  if (kind === "book" || kind === "videogame") return { status: 400, body: { errors: [{ message: `${type} does not yet support trending requests.`, subtype: type }] } };
  if (!kind) return invalid("filter.type must be a supported entity type", "filter.type");
  const ids = q.list("signal.interests.entities");
  if (ids.length !== 1) return invalid("signal.interests.entities must contain exactly one entity", "signal.interests.entities");
  const start = q.one("filter.start_date") ?? "";
  const end = q.one("filter.end_date") ?? "";
  if (!DAY.test(start) || !DAY.test(end)) return invalid("filter.start_date and filter.end_date must be dates", "filter.start_date");
  const from = Date.parse(`${start}T00:00:00Z`);
  const days = Math.min(400, Math.max(0, Math.round((Date.parse(`${end}T00:00:00Z`) - from) / DAY_MS)));
  const percentile = round(between(`pct|${ids[0]}`, 0.05, 0.95), 6);
  const rank = String(Math.round(between(`rank|${ids[0]}`, 500, 40000)));
  const rows = Array.from({ length: days + 1 }, (_, i) => ({
    date: new Date(from + i * DAY_MS).toISOString().slice(0, 10),
    population_percent_delta: 0,
    population_percentile: percentile,
    population_rank: rank,
    population_rank_velocity: 0,
    velocity_fold_change: 0,
  }));
  return ok({ duration: 6, results: { trending: rows }, success: true });
}
