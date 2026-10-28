import { RANGE_WORDS, TURNOUT_SHOWN_FROM, type SeriesName, type StatsBody } from "../../../src/shared/stats.ts";
import { columns } from "../charts/columns.ts";
import { saying, type Say } from "../charts/counter.ts";
import { fitChart } from "../charts/fit.ts";
import { legend, pane } from "../charts/panel.ts";
import { sparkline } from "../charts/sparkline.ts";
import { asTable, type Cell } from "../charts/table.ts";
import { bucketSpan, bucketTick, count, countedFrom, dayMonth } from "../charts/time.ts";
import { h } from "../dom.ts";
import { empty } from "../ui/states.ts";
import type { BoardTools } from "./live-board.ts";

type CountedSeries = Extract<SeriesName, keyof StatsBody["allTime"]>;

interface StatDef {
  key: CountedSeries;
  title: string;
  say: Say;
  line: string;
  tone: "chalk" | "lit";
}

const STATS: StatDef[] = [
  { key: "venues", title: "Venues", say: saying("venue set up", "venues set up"), line: "Venues set up on this server.", tone: "chalk" },
  { key: "streetReads", title: "Street reads", say: saying("street read", "street reads"), line: "Reads of the street around a venue, up to 30 Qloo calls each.", tone: "chalk" },
  { key: "nightsPublished", title: "Nights published", say: saying("night published", "nights published"), line: "Nights an owner approved and put out.", tone: "chalk" },
  { key: "rsvps", title: "RSVPs", say: saying("RSVP", "RSVPs"), line: "Yes taps on public event pages, one per browser.", tone: "lit" },
];

const BUCKET_WORDS: Record<number, string> = { 1: "one hour", 6: "six hours", 24: "one day" };
const UTC_DAYS = "Days run midnight to midnight UTC.";
const NOT_COUNTED = "not counted";

function span(body: StatsBody, tz: string, i: number): string {
  return bucketSpan(body.buckets[i] ?? "", body.bucketHours, tz);
}

function firstCounted(body: StatsBody): number {
  return countedFrom(body.buckets, body.bucketHours, body.since);
}

// One table row per bucket; buckets from before counting began say so instead of showing zeros.
function bucketRows(body: StatsBody, tz: string, cells: (i: number) => Cell[]): Cell[][] {
  const from = firstCounted(body);
  return body.buckets.map((_, i) => {
    const row = cells(i);
    return [span(body, tz, i), ...(i < from ? row.map(() => NOT_COUNTED) : row)];
  });
}

function utcNote(body: StatsBody): string {
  return body.bucketHours >= 24 ? ` ${UTC_DAYS}` : "";
}

function statPane(def: StatDef, body: StatsBody, tools: BoardTools): HTMLElement {
  const counter = tools.counter(def.key, def.say, def.tone);
  counter.set(body.totals[def.key]);
  const values = body.series[def.key];
  const host = h("div", { class: "spark-host" });
  fitChart(host, (w) =>
    sparkline({ name: def.title, values, tone: def.tone, describe: (i) => ({ title: span(body, tools.tz, i), value: count(values[i] ?? 0) }) }, w),
  );
  return h(
    "section",
    { class: "pane pane-stat", "aria-labelledby": `pane-${def.key}`, "data-pane": def.key },
    h("h2", { class: "pane-title", id: `pane-${def.key}` }, def.title),
    counter.el,
    h("p", { class: "stat-caption" }, `In ${RANGE_WORDS[body.range]}. ${count(body.allTime[def.key])} since counting began.`),
    host,
    h("p", { class: "pane-line" }, def.line),
  );
}

// Head counts are shown only as a total over enough nights, never per bucket, so no single night can be picked out.
function turnoutPane(body: StatsBody, tools: BoardTools): HTMLElement {
  const t = body.totals;
  const nights = saying("night", "nights")(t.turnoutNights);
  const shown = t.turnoutPeople !== null;
  const counter = shown
    ? tools.counter("turnoutPeople", saying("person counted at a night", "people counted at nights"))
    : tools.counter("turnoutNights", saying("night with a turnout logged", "nights with a turnout logged"));
  counter.set(shown ? (t.turnoutPeople ?? 0) : t.turnoutNights);
  const ever = body.allTime.turnoutPeople === null ? "" : ` ${count(body.allTime.turnoutPeople)} people since counting began.`;
  const caption = shown
    ? `In ${RANGE_WORDS[body.range]}, over ${nights}.${ever}`
    : `Logged for ${nights} in ${RANGE_WORDS[body.range]}. Head counts show here once ${TURNOUT_SHOWN_FROM} nights are logged, so no one venue's night can be read off this page.`;
  return h(
    "section",
    { class: "pane pane-stat", "aria-labelledby": "pane-turnoutPeople", "data-pane": "turnoutPeople" },
    h("h2", { class: "pane-title", id: "pane-turnoutPeople" }, "Turnout"),
    counter.el,
    h("p", { class: "stat-caption" }, caption),
    h("p", { class: "pane-line" }, "People owners counted at their nights, added up across venues."),
  );
}

export function statRow(body: StatsBody, tools: BoardTools): HTMLElement {
  return h(
    "div",
    { class: "stat-row" },
    h("div", { class: "stat-panes" }, ...STATS.map((d) => statPane(d, body, tools)), turnoutPane(body, tools)),
    asTable("stats", {
      caption: `Activity by bucket in ${RANGE_WORDS[body.range]}.${utcNote(body)}`,
      head: ["Time", ...STATS.map((d) => d.title)],
      rows: bucketRows(body, tools.tz, (i) => STATS.map((d) => body.series[d.key][i] ?? 0)),
      numeric: [false, ...STATS.map(() => true)],
    }),
  );
}

export function callsPane(body: StatsBody, tools: BoardTools): HTMLElement {
  const t = body.totals;
  const s = body.series;
  const each = BUCKET_WORDS[body.bucketHours] ?? `${body.bucketHours} hours`;
  if (t.qlooCalls + t.qlooCacheHits + t.qlooErrors === 0) {
    return pane({
      key: "calls",
      title: "Qloo calls",
      line: `Live calls to Qloo and answers from the cache, ${each} to a column.${utcNote(body)}`,
      span: "wide",
      body: [empty(`No Qloo calls in ${RANGE_WORDS[body.range]}. Columns appear here when someone searches for a venue or a venue reads its street.`)],
    });
  }
  const from = firstCounted(body);
  const host = h("div", { class: "chart-host" });
  fitChart(host, (w) =>
    columns(
      {
        name: `Qloo calls, ${each} to a column`,
        series: [
          { name: "Live calls", values: s.qlooCalls, mark: "solid" },
          { name: "From cache", values: s.qlooCacheHits, mark: "hatched" },
        ],
        crosses: s.qlooErrors,
        tick: (i) => bucketTick(body.buckets[i] ?? "", body.bucketHours, tools.tz),
        span: (i) => span(body, tools.tz, i),
        extra: (i) => ((s.qlooErrors[i] ?? 0) > 0 ? [{ label: "Errors", value: String(s.qlooErrors[i]), mark: "stop" }] : []),
        ...(from > 0 && body.since ? { countedFrom: { index: from, label: `Counting began ${dayMonth(body.since, body.bucketHours >= 24 ? "UTC" : tools.tz)}` } } : {}),
        height: 220,
      },
      w,
    ),
  );
  return pane({
    key: "calls",
    title: "Qloo calls",
    line: `Each column is ${each}. Solid is a live call to Qloo, hatched came from the cache, a cross marks errors.${utcNote(body)}`,
    span: "wide",
    body: [
      legend([
        { label: "Live calls", mark: "solid", value: count(t.qlooCalls) },
        { label: "From cache", mark: "hatched", value: count(t.qlooCacheHits) },
        { label: "Errors", mark: "stop", value: count(t.qlooErrors) },
      ]),
      host,
      asTable("calls", {
        caption: `Qloo calls by bucket.${utcNote(body)}`,
        head: ["Time", "Live calls", "From cache", "Errors"],
        rows: bucketRows(body, tools.tz, (i) => [s.qlooCalls[i] ?? 0, s.qlooCacheHits[i] ?? 0, s.qlooErrors[i] ?? 0]),
        numeric: [false, true, true, true],
      }),
    ],
  });
}
