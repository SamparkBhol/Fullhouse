import {
  errorMessage,
  explainSummary,
  parseCompare,
  parseDemographics,
  parseEntities,
  parseHeatmap,
  parseTags,
  parseTrending,
  resultsOf,
} from "../../src/core/qloo/index.ts";
import type { ProbeContext } from "./context.ts";
import { explainLayout } from "./lens.ts";
import { APP_MAX_HEAT_CELLS } from "./plan.ts";
import type { CallRecord } from "./record.ts";
import { shapeKey } from "./shape.ts";

interface Tally {
  responses: number;
  raw: number;
  parsed: number;
  notes: Map<string, number>;
}

function lengthAt(body: unknown, key: string): number {
  const r = resultsOf(body) as any;
  if (key === "" && Array.isArray(r)) return r.length;
  return Array.isArray(r?.[key]) ? r[key].length : 0;
}

function note(t: Tally, text: string, n = 1): void {
  if (n > 0) t.notes.set(text, (t.notes.get(text) ?? 0) + n);
}

function auditAnswer(rec: CallRecord, t: Tally): void {
  const type = rec.params["filter.type"] ?? "";
  const body = rec.body;
  if (rec.path === "/search" || rec.path === "/entities") {
    const parsed = parseEntities(body);
    t.raw += lengthAt(body, "");
    t.parsed += parsed.length;
    note(t, "hits without coordinates after parsing", parsed.filter((e) => e.lat === null).length);
  } else if (rec.path === "/v2/analysis/compare") {
    t.raw += lengthAt(body, "tags") + lengthAt(body, "a") + lengthAt(body, "b");
    const compared = parseCompare(body);
    t.parsed += compared.shared.length + compared.a.length + compared.b.length;
  } else if (rec.path === "/v2/trending") {
    t.raw += lengthAt(body, "trending");
    t.parsed += parseTrending(body).length;
  } else if (type === "urn:tag") {
    const tags = parseTags(body);
    t.raw += lengthAt(body, "tags");
    t.parsed += tags.length;
    note(t, "tags without a score", tags.filter((x) => x.score === null).length);
  } else if (type === "urn:heatmap") {
    const cells = parseHeatmap(body);
    t.raw += lengthAt(body, "heatmap") + lengthAt(body, "entities");
    t.parsed += cells.length;
    note(t, "locality polygons under results.entities that parseHeatmap never reads", lengthAt(body, "entities"));
    note(t, `cells over the app's ${APP_MAX_HEAT_CELLS} cell cap`, Math.max(0, cells.length - APP_MAX_HEAT_CELLS));
  } else if (type === "urn:demographics") {
    t.raw += lengthAt(body, "demographics");
    t.parsed += parseDemographics(body).length;
  } else if (rec.path === "/v2/insights") {
    const entities = parseEntities(body);
    t.raw += lengthAt(body, "entities");
    t.parsed += entities.length;
    const layout = explainLayout(rec);
    note(t, "results with explainability that parse into no rows", layout.explained - entities.filter((e) => e.explain.length > 0).length);
    note(t, "responses whose top level explainability explainSummary cannot read", layout.top.length && !explainSummary(body).length ? 1 : 0);
  }
}

function auditError(rec: CallRecord, t: Tally): void {
  if (rec.status === 0) return;
  note(t, `HTTP ${rec.status} bodies whose message errorMessage cannot read`, errorMessage(rec.body) ? 0 : 1);
}

export function auditSection(ctx: ProbeContext): string[] {
  const tallies = new Map<string, Tally>();
  for (const rec of ctx.records) {
    const key = `${shapeKey(rec)} ${rec.path}`;
    const t = tallies.get(key) ?? { responses: 0, raw: 0, parsed: 0, notes: new Map() };
    t.responses += 1;
    if (rec.status === 200) auditAnswer(rec, t);
    else auditError(rec, t);
    tallies.set(key, t);
  }
  const out = ["PARSER AUDIT", "", "The app's parsers from src/core/qloo run against every live answer. Raw is what the body holds, parsed is what the app would keep.", ""];
  for (const [key, t] of [...tallies.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const flags = [...t.notes.entries()].map(([text, n]) => `${n} ${text}`);
    if (!flags.length && t.raw === t.parsed) continue;
    out.push(`${key}: ${t.responses} responses, raw ${t.raw}, parsed ${t.parsed}${flags.length ? `; ${flags.join("; ")}` : ""}`);
  }
  if (out.length === 4) out.push("Every answer parsed in full.");
  return out;
}
