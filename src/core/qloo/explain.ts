import { list, num, obj, str } from "./values.ts";

export interface ExplainRow {
  entityId: string;
  score: number;
}

// The key is the literal dotted string; explainability only covers entity signals.
const ENTITY_SIGNAL = "signal.interests.entities";

function rows(raw: unknown, scoreKey: "score" | "avg_score"): ExplainRow[] {
  const out: ExplainRow[] = [];
  for (const item of list(raw)) {
    const entityId = str(obj(item).entity_id);
    const score = num(obj(item)[scoreKey]);
    if (entityId && score !== null) out.push({ entityId, score });
  }
  return out.sort((a, b) => b.score - a.score || a.entityId.localeCompare(b.entityId));
}

// Per result: query.explainability["signal.interests.entities"] is [{entity_id, score}].
export function parseExplain(explainability: unknown): ExplainRow[] {
  return rows(obj(explainability)[ENTITY_SIGNAL], "score");
}

export type ExplainScope = "effect_on_top3_recs" | "effect_on_top5_recs" | "effect_on_top10_recs" | "effect_on_all_recs";

// Top level: query.explainability["signal.interests.entities"].effect_on_*_recs is [{entity_id, avg_score}].
export function explainSummary(body: unknown, scope: ExplainScope = "effect_on_all_recs"): ExplainRow[] {
  const block = obj(obj(obj(obj(body).query).explainability)[ENTITY_SIGNAL]);
  return rows(block[scope], "avg_score");
}
