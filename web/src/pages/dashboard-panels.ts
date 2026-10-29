import type { DashboardMonday, DashboardNight, VenueDashboard } from "../../../src/shared/stats.ts";
import { saying } from "../charts/counter.ts";
import { fitChart } from "../charts/fit.ts";
import { legend } from "../charts/panel.ts";
import { asTable } from "../charts/table.ts";
import { tallyColumns, type TallyNight } from "../charts/tally.ts";
import { count, stamp } from "../charts/time.ts";
import { h } from "../dom.ts";
import { formatName, longDate, shortDate, todayIn } from "../format.ts";
import type { BoardTools } from "./live-board.ts";

const LISTED = 5;

type NightKind = TallyNight["kind"];

const KIND_WORDS: Record<NightKind, string> = { lit: "On the street", done: "Turnout logged", open: "Waiting for turnout", withdrawn: "Taken down" };

function kindOf(n: DashboardNight, today: string): NightKind {
  if (n.withdrawn) return "withdrawn";
  if (n.headcount !== undefined) return "done";
  return n.public && n.date >= today ? "lit" : "open";
}

const orNone = (v: number | undefined, none: string): string => (v === undefined ? none : count(v));

// One part of the tally board: a chalk heading, the line that says what it counts, then the marks.
function part(key: string, heading: string, line: string | null, ...body: (Node | null)[]): HTMLElement {
  const id = `pane-${key}`;
  return h("section", { class: `tally-part tally-${key}`, "data-pane": key, "aria-labelledby": id }, h("h2", { class: "tally-title", id }, heading), line ? h("p", { class: "tally-line" }, line) : null, ...body);
}

const chalkEmpty = (text: string): HTMLElement => h("p", { class: "tally-empty" }, text);

function nextPart(d: VenueDashboard, tools: BoardTools): HTMLElement {
  if (!d.next) return part("next", "Next night", null, chalkEmpty("No published night coming up. Publish one and its RSVPs show here as they come in."));
  const n = d.next;
  const counter = tools.counter("next", saying("RSVP", "RSVPs", " for your next night"), "lit", 1);
  counter.set(n.rsvps);
  const said = n.rsvps === 1 ? "has said yes" : "have said yes";
  return part(
    "next",
    "Next night",
    null,
    h("div", { class: "tally-yes-count" }, counter.el, h("span", { class: "tally-yes-words", "aria-hidden": "true" }, n.room ? `of ${count(n.room)} ${said}` : said)),
    h("p", { class: "tally-caption" }, `${n.title}, ${longDate(n.date)} at ${n.start}.`),
    h("p", { class: "tally-note" }, n.room ? "Counted on the event page as people say yes." : "Counted on the event page as people say yes. No room size is set for this night."),
  );
}

function tallyNight(n: DashboardNight, today: string): TallyNight {
  const kind = kindOf(n, today);
  const [weekday = "", ...rest] = shortDate(n.date).split(" ");
  return {
    weekday,
    day: rest.join(" "),
    kind,
    title: `${n.title}, ${longDate(n.date)}`,
    rsvps: n.rsvps,
    ...(n.headcount !== undefined ? { came: n.headcount } : {}),
    ...(n.room !== undefined ? { room: n.room } : {}),
    rows: [
      { label: "Said yes", value: count(n.rsvps), mark: "tick" },
      { label: "Came", value: orNone(n.headcount, "not logged"), mark: "hatched" },
      { label: "Room", value: orNone(n.room, "not set"), mark: "outline" },
      { label: "Where it stands", value: KIND_WORDS[kind] },
    ],
  };
}

function nightsPart(d: VenueDashboard): HTMLElement {
  const today = todayIn(d.tz);
  const line = "Each column is a night. The dashed box is your room, the chalk shading is who came, the yellow stroke is how many said yes.";
  if (!d.nights.length) return part("nights", "Your nights", line, chalkEmpty("No published nights yet. Each night you publish gets a column here."));
  const marks = d.nights.map((n) => tallyNight(n, today));
  const host = h("div", { class: "chart-host tally-host" });
  fitChart(host, (w) => tallyColumns(marks, w));
  return part(
    "nights",
    "Your nights",
    line,
    legend([
      { label: "Room", mark: "outline" },
      { label: "Came", mark: "hatched" },
      { label: "Said yes", mark: "tick" },
    ]),
    host,
    asTable("nights", {
      caption: "Your nights",
      head: ["Date", "Night", "Where it stands", "Said yes", "Came", "Room"],
      rows: [...d.nights].reverse().map((n) => [longDate(n.date), n.title, KIND_WORDS[kindOf(n, today)], n.rsvps, orNone(n.headcount, "not logged"), orNone(n.room, "not set")]),
      numeric: [false, false, false, true, true, true],
    }),
  );
}

function chalkList(rows: [string, string, string?][]): HTMLElement {
  return h("ol", { class: "tally-list" }, rows.map(([when, what, cls]) => h("li", { class: cls ?? null }, h("span", { class: "tally-when" }, when), h("span", { class: "tally-what" }, what))));
}

function mondayRunLine(m: DashboardMonday): string {
  const p = m.proposal;
  if (!m.planned || !p) return "Read the street and drafted nothing.";
  const kind = formatName(p.format).toLowerCase();
  return `Drafted a ${kind} for ${longDate(p.date)} at ${p.start}: ${p.title}.${p.published ? " You published it." : ""}`;
}

function mondaysPart(d: VenueDashboard): HTMLElement {
  const next = d.nextAlarm ? `Next run ${stamp(d.nextAlarm, d.tz)}.` : "No Monday run is scheduled yet.";
  const runs = [...d.mondays].reverse();
  return part(
    "mondays",
    "Monday runs",
    "Every Monday at 09:00 your agent reads the street again and drafts a night. It never publishes one on its own.",
    h("p", { class: "tally-caption" }, next),
    runs.length
      ? chalkList(runs.slice(0, LISTED).map((m) => [stamp(m.at, d.tz), mondayRunLine(m), m.proposal?.published ? "tally-published" : undefined]))
      : chalkEmpty("No Monday runs yet. The first one shows here with the night it drafted."),
  );
}

// The venue's own tally board behind the bar: next night's yes count, the nights in chalk columns,
// then the Monday runs along the bottom.
export function tallyBoard(d: VenueDashboard, tools: BoardTools): HTMLElement {
  return h(
    "div",
    { class: "slate tally" },
    h("div", { class: "tally-top-row" }, nextPart(d, tools), nightsPart(d)),
    h("div", { class: "tally-bottom-row" }, mondaysPart(d)),
  );
}
