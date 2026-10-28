import type { Query } from "../params.ts";
import { takeOf, wkt } from "../params.ts";
import { between, shuffled } from "../seed.ts";
import { WORK_URN, worksOf, type WorkType } from "../world/media.ts";
import { invalid, ok, type Answer } from "./answer.ts";
import { insightsEnvelope, insightsWork } from "./render.ts";

const NO_TREND_BIAS: WorkType[] = ["book", "videogame"];

// The venue in the signal reorders the pool for that venue; a location alone returns the same global list everywhere.
export function workInsights(type: WorkType, q: Query): Answer {
  if (q.one("bias.trends") !== undefined && NO_TREND_BIAS.includes(type)) {
    return { status: 400, body: { errors: [{ message: `${WORK_URN[type]} does not yet support trending requests.`, subtype: WORK_URN[type] }] } };
  }
  const take = takeOf(q, 20);
  if (take === null) return invalid("take must be an integer value between 1 and 50", "take");
  const ids = q.list("signal.interests.entities");
  const located = wkt(q, "signal.location") !== null;
  if (!ids.length && !located && !q.list("signal.interests.tags").length && !wkt(q, "filter.location")) {
    return invalid("at least one valid signal or filter is required for entity insights");
  }
  const explain = q.one("feature.explainability") === "true" && ids.length > 0;
  const pool = ids.length ? shuffled(worksOf(type), `${type}|${ids.join(",")}`) : worksOf(type);
  const rows = pool.slice(0, take).map((w, i) => {
    const affinity = ids.length ? 0.99 - i * 0.017 - between(`${ids[0]}|${w.id}`, 0, 0.004) : 0.99999 - i * 0.00001;
    return insightsWork(w, between(`pop|${w.id}`, 0.6, 0.99), { affinity, ...(explain ? { explainedBy: ids } : {}) });
  });
  return ok(insightsEnvelope("entities", rows, { ...(explain ? { explained: ids } : {}), located }));
}
