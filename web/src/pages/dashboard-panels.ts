import type { DashboardMonday, DashboardNight, VenueDashboard } from "../../../src/shared/stats.ts";
import { saying } from "../charts/counter.ts";
import { fitChart } from "../charts/fit.ts";
import { legend } from "../charts/panel.ts";
import { asTable } from "../charts/table.ts";
import { tallyColumns, type TallyNight } from "../charts/tally.ts";
import { count, stamp } from "../charts/time.ts";
import { h } from "../dom.ts";
import { formatName, longDate, shortDate, todayIn } from "../format.ts";
import { empty } from "../ui/states.ts";
import type { BoardTools } from "./live-board.ts";

const LISTED = 5;

type NightKind = TallyNight["kind"];

const KIND_WORDS: Record<NightKind, string> = { upcoming: "Coming up", done: "Turnout logged", open: "Waiting for turnout", withdrawn: "Taken down" };

function kindOf(n: DashboardNight, today: string): NightKind {
  if (n.withdrawn) return "withdrawn";
  if (n.headcount !== undefined) return "done";
  return n.public && n.date >= today ? "upcoming" : "open";
}

const orNone = (v: number | undefined, none: string): string => (v === undefined ? none : count(v));

function panel(key: string, heading: string, line: string | null, ...body: (Node | null)[]): HTMLElement {
  const id = `pane-${key}`;
  return h("section", { class: `panel pane pane-${key}`, "data-pane": key, "aria-labelledby": id }, h("h2", { class: "pane-title", id }, heading), line ? h("p", { class: "pane-line" }, line) : null, ...body);
}

function nextPanel(d: VenueDashboard, tools: BoardTools): HTMLElement {
  if (!d.next) return panel("next", "Next night", null, empty("No published night coming up. Publish one and its RSVPs show here as they come in."));
  const n = d.next;
  const yes = tools.counter("next", saying("RSVP", "RSVPs", " for your next night"), "you");
  yes.set(n.rsvps);
  const said = n.rsvps === 1 ? "has said yes" : "have said yes";
  const bar = n.room ? h("div", { class: "next-bar", "aria-hidden": "true" }, h("i")) : null;
  if (bar && n.room) (bar.firstElementChild as HTMLElement).style.width = `${Math.min(100, (100 * n.rsvps) / n.room)}%`;
  return panel(
    "next",
    "Next night",
    null,
    h("div", { class: "next-count" }, yes.el, h("span", { class: "next-words", "aria-hidden": "true" }, n.room ? `of ${count(n.room)} ${said}` : said)),
    bar,
    h("p", { class: "next-night" }, `${n.title}, ${longDate(n.date)} at ${n.start}.`),
    h("p", { class: "pane-note" }, n.room ? "Counted on the event page as people say yes." : "Counted on the event page as people say yes. No room size is set for this night."),
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
      { label: "Said yes", value: count(n.rsvps), mark: "yes" },
      { label: "Came", value: orNone(n.headcount, "not logged"), mark: "shade" },
      { label: "Room", value: orNone(n.room, "not set"), mark: "outline" },
      { label: "Where it stands", value: KIND_WORDS[kind] },
    ],
  };
}

function nightsPanel(d: VenueDashboard): HTMLElement {
  const today = todayIn(d.tz);
  const line = "Each column is a night. The outline is your room, the shaded part is who came, the green line is how many said yes.";
  if (!d.nights.length) return panel("nights", "Your nights", line, empty("No published nights yet. Each night you publish gets a column here."));
  const marks = d.nights.map((n) => tallyNight(n, today));
  const host = h("div", { class: "chart-host nights-host" });
  fitChart(host, (w) => tallyColumns(marks, w));
  return panel(
    "nights",
    "Your nights",
    line,
    legend([
      { label: "Room", mark: "outline" },
      { label: "Came", mark: "shade" },
      { label: "Said yes", mark: "yes" },
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

function mondayRunLine(m: DashboardMonday): string {
  const p = m.proposal;
  if (!m.planned || !p) return "Read the street and drafted nothing.";
  const kind = formatName(p.format).toLowerCase();
  return `Drafted a ${kind} for ${longDate(p.date)} at ${p.start}: ${p.title}.${p.published ? " You published it." : ""}`;
}

function runList(runs: DashboardMonday[], tz: string): HTMLElement {
  return h(
    "ol",
    { class: "runs" },
    runs.map((m) =>
      h("li", { class: m.proposal?.published ? "runs-published" : null }, h("time", { class: "runs-when", datetime: m.at }, stamp(m.at, tz)), h("span", { class: "runs-what" }, mondayRunLine(m))),
    ),
  );
}

function mondaysPanel(d: VenueDashboard): HTMLElement {
  const next = d.nextAlarm ? `Next run ${stamp(d.nextAlarm, d.tz)}.` : "No Monday run is scheduled yet.";
  const runs = [...d.mondays].reverse();
  return panel(
    "mondays",
    "Monday runs",
    "Every Monday at 09:00 your agent reads the street again and drafts a night. It never publishes one on its own.",
    h("p", { class: "pane-note runs-next" }, next),
    runs.length ? runList(runs.slice(0, LISTED), d.tz) : empty("No Monday runs yet. The first one shows here with the night it drafted."),
  );
}

// The next night's yes count across the top, then the nights chart beside the Monday runs and the swaps.
export function venueBoard(d: VenueDashboard, tools: BoardTools, pairs: HTMLElement | null): Node[] {
  return [
    nextPanel(d, tools),
    h("div", { class: "board-cols" }, h("div", { class: "board-col board-main" }, nightsPanel(d)), h("div", { class: "board-col board-side" }, mondaysPanel(d), pairs)),
  ];
}
