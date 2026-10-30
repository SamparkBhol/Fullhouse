import { ANSWER_KEYS } from "../../shared/answers.ts";
import { TURNOUT_SHOWN_FROM, type BudgetToday, type EndpointStats, type LoggedEvent, type SeriesName, type StatsBody, type StatsCounts, type StatsSeries } from "../../shared/stats.ts";
import type { Metric } from "./counters.ts";
import { latencySummary, type StepCount } from "./percentile.ts";
import { bucketIndex, bucketStarts, type StatsWindow } from "./window.ts";

export interface CounterRow {
  t: number;
  metric: string;
  label: string;
  n: number;
}

export interface LatencyRow {
  endpoint: string;
  step: number;
  n: number;
}

export interface StatsInputs {
  window: StatsWindow;
  rows: CounterRow[];
  latency: LatencyRow[];
  allTime: { metric: string; n: number }[];
  events: LoggedEvent[];
  since: string | null;
  budget: BudgetToday;
}

const SERIES_METRIC: Record<SeriesName, Metric> = {
  venues: "venue",
  streetReads: "read",
  nightsPublished: "publish",
  rsvps: "rsvp",
  qlooCalls: "qloo_call",
  qlooCacheHits: "qloo_cache",
  qlooErrors: "qloo_error",
};

class Tally {
  private readonly labels = new Map<string, Map<string, number>>();

  add(metric: string, label: string, n: number): void {
    const m = this.labels.get(metric) ?? new Map<string, number>();
    m.set(label, (m.get(label) ?? 0) + n);
    this.labels.set(metric, m);
  }

  total(metric: Metric, label?: string): number {
    const m = this.labels.get(metric);
    if (!m) return 0;
    if (label !== undefined) return m.get(label) ?? 0;
    let sum = 0;
    for (const n of m.values()) sum += n;
    return sum;
  }

  byLabel(metric: Metric): Map<string, number> {
    return this.labels.get(metric) ?? new Map<string, number>();
  }
}

// Below the threshold a total could be one venue's night, so it is left out of the answer, not shown as zero.
function shown(t: Tally, metric: Metric): number | null {
  return t.total("turnout_nights") >= TURNOUT_SHOWN_FROM ? t.total(metric) : null;
}

function counts(t: Tally): StatsCounts {
  return {
    venues: t.total("venue"),
    streetReads: t.total("read"),
    plans: t.total("plan"),
    nightsPublished: t.total("publish"),
    rsvps: t.total("rsvp"),
    turnoutNights: t.total("turnout_nights"),
    turnoutPeople: shown(t, "turnout_people"),
    roomNights: shown(t, "room_nights"),
    roomSeats: shown(t, "room_seats"),
    roomPeople: shown(t, "room_people"),
    mondayRuns: t.total("monday"),
    mondayPlanned: t.total("monday", "planned"),
    invitesSent: t.total("invite", "sent"),
    invitesAccepted: t.total("invite", "yes"),
    answers: ANSWER_KEYS.map((key) => ({ key, n: t.total("answer", key) })),
    mcpCalls: t.total("mcp"),
    copyModel: t.total("plan", "model"),
    copyTemplate: t.total("plan", "template"),
    qlooCalls: t.total("qloo_call"),
    qlooCacheHits: t.total("qloo_cache"),
    qlooErrors: t.total("qloo_error"),
  };
}

function endpoints(t: Tally, latency: LatencyRow[]): EndpointStats[] {
  const samples = new Map<string, StepCount[]>();
  for (const r of latency) {
    const list = samples.get(r.endpoint);
    if (list) list.push({ step: r.step, n: r.n });
    else samples.set(r.endpoint, [{ step: r.step, n: r.n }]);
  }
  const names = new Set([...t.byLabel("qloo_call").keys(), ...t.byLabel("qloo_cache").keys(), ...t.byLabel("qloo_error").keys()]);
  return [...names]
    .map((endpoint) => ({
      endpoint,
      calls: t.total("qloo_call", endpoint),
      cacheHits: t.total("qloo_cache", endpoint),
      errors: t.total("qloo_error", endpoint),
      ...latencySummary(samples.get(endpoint) ?? []),
    }))
    .sort((a, b) => b.calls + b.cacheHits - (a.calls + a.cacheHits) || a.endpoint.localeCompare(b.endpoint));
}

function ranked(m: Map<string, number>): { label: string; n: number }[] {
  return [...m].filter(([, n]) => n > 0).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

export function aggregate(input: StatsInputs): StatsBody {
  const w = input.window;
  const tally = new Tally();
  const series = Object.fromEntries(Object.keys(SERIES_METRIC).map((k) => [k, Array<number>(w.count).fill(0)])) as StatsSeries;
  const seriesOf = new Map(Object.entries(SERIES_METRIC).map(([name, metric]) => [metric, series[name as SeriesName]]));
  for (const row of input.rows) {
    const i = bucketIndex(w, row.t);
    if (i < 0) continue;
    tally.add(row.metric, row.label, row.n);
    const line = seriesOf.get(row.metric as Metric);
    if (line) line[i] = (line[i] ?? 0) + row.n;
  }
  const ever = new Tally();
  for (const r of input.allTime) ever.add(r.metric, "", r.n);
  return {
    range: w.range,
    since: input.since,
    bucketHours: w.unitHours * w.bucketUnits,
    buckets: bucketStarts(w),
    totals: counts(tally),
    allTime: {
      venues: ever.total("venue"),
      streetReads: ever.total("read"),
      nightsPublished: ever.total("publish"),
      rsvps: ever.total("rsvp"),
      turnoutNights: ever.total("turnout_nights"),
      turnoutPeople: shown(ever, "turnout_people"),
    },
    series,
    endpoints: endpoints(tally, input.latency),
    errorKinds: ranked(tally.byLabel("qloo_error_kind")).map(({ label, n }) => ({ kind: label, n })),
    mcpTools: ranked(tally.byLabel("mcp")).map(({ label, n }) => ({ tool: label, n })),
    budget: input.budget,
    events: input.events,
  };
}
