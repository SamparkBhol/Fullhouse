import type { DashboardMonday, DashboardNight, VenueDashboard } from "../../../src/shared/stats.ts";
import { columns } from "../charts/columns.ts";
import { saying } from "../charts/counter.ts";
import { fitChart } from "../charts/fit.ts";
import { legend, pane } from "../charts/panel.ts";
import { roomBars } from "../charts/rooms.ts";
import { asTable } from "../charts/table.ts";
import { count, dayMonth, stamp } from "../charts/time.ts";
import { nightTimeline, type TimelineMark } from "../charts/timeline.ts";
import { h } from "../dom.ts";
import { formatName, longDate, shortDate, todayIn } from "../format.ts";
import { empty } from "../ui/states.ts";
import type { BoardTools } from "./live-board.ts";

const ROOM_ROWS = 8;
const READ_COLUMNS = 12;
const READ_COLUMN_MAX = 64;

type NightKind = TimelineMark["kind"];

const KIND_WORDS: Record<NightKind, string> = { lit: "On the street", done: "Turnout logged", open: "Waiting for turnout", withdrawn: "Taken down" };

function kindOf(n: DashboardNight, today: string): NightKind {
  if (n.withdrawn) return "withdrawn";
  if (n.headcount !== undefined) return "done";
  return n.public && n.date >= today ? "lit" : "open";
}

const orNone = (v: number | undefined, none: string): string => (v === undefined ? none : count(v));

export function nextPane(d: VenueDashboard, tools: BoardTools): HTMLElement {
  const line = "How many said yes on the event page of your next published night. It counts up by itself.";
  if (!d.next) {
    return pane({ key: "next", title: "Next night", line, span: "side", body: [empty("No published night coming up. Publish one and its RSVPs show here as they come in.")] });
  }
  const n = d.next;
  const counter = tools.counter("next", saying("RSVP", "RSVPs", " for your next night"), "lit");
  counter.set(n.rsvps);
  const room = n.room ? `${count(n.rsvps)} of a room of ${count(n.room)} have said yes.` : "No room size set for this night.";
  return pane({
    key: "next",
    title: "Next night",
    line,
    span: "side",
    body: [counter.el, h("p", { class: "stat-caption" }, `${n.title}, ${longDate(n.date)} at ${n.start}.`), h("p", { class: "pane-note" }, room)],
  });
}

function nightRows(nights: DashboardNight[], today: string): (string | number)[][] {
  return [...nights].reverse().map((n) => [longDate(n.date), n.title, KIND_WORDS[kindOf(n, today)], n.rsvps, orNone(n.headcount, "not logged"), orNone(n.room, "not set")]);
}

export function nightsPane(d: VenueDashboard): HTMLElement {
  const today = todayIn(d.tz);
  const line = "Each square is a night on its date. Yellow is out on the street now, filled ones have a turnout, hollow ones still need one.";
  if (!d.nights.length) {
    return pane({ key: "nights", title: "Your nights", line, span: "wide", body: [empty("No published nights yet. Each night you publish gets a square here on its date.")] });
  }
  const marks: TimelineMark[] = d.nights.map((n) => ({
    date: n.date,
    kind: kindOf(n, today),
    title: `${n.title}, ${longDate(n.date)}`,
    rows: [
      { label: "Said yes", value: count(n.rsvps), mark: "lit" },
      { label: "Came", value: orNone(n.headcount, "not logged"), mark: "solid" },
      { label: "Room", value: orNone(n.room, "not set"), mark: "outline" },
    ],
  }));
  const host = h("div", { class: "chart-host" });
  fitChart(host, (w) => nightTimeline(marks, today, w));
  return pane({
    key: "nights",
    title: "Your nights",
    line,
    span: "wide",
    body: [
      legend([
        { label: "On the street", mark: "lit" },
        { label: "Turnout logged", mark: "solid" },
        { label: "Waiting for turnout", mark: "outline" },
      ]),
      host,
      asTable("nights", { caption: "Your nights", head: ["Date", "Night", "Where it stands", "Said yes", "Came", "Room"], rows: nightRows(d.nights, today), numeric: [false, false, false, true, true, true] }),
    ],
  });
}

function roomNote(n: DashboardNight): string {
  const came = n.headcount === undefined ? "turnout not logged" : `${count(n.headcount)} came`;
  return [came, `${count(n.rsvps)} said yes`, n.room === undefined ? null : `room ${count(n.room)}`].filter(Boolean).join(", ");
}

export function roomsPane(d: VenueDashboard): HTMLElement {
  const line = "The box is your room. The filled bar is who came. The yellow mark is how many said yes on the event page.";
  // A night still ahead has nothing to compare yet; it shows under Next night and Your nights.
  const today = todayIn(d.tz);
  const recent = [...d.nights].filter((n) => !n.withdrawn && (n.date < today || n.headcount !== undefined)).reverse().slice(0, ROOM_ROWS);
  if (!recent.length) {
    return pane({ key: "rooms", title: "How full the house was", line, span: "wide", body: [empty("Nothing to compare yet. After a night, log how many came and it shows here against your room.")] });
  }
  const rows = recent.map((n) => ({
    label: shortDate(n.date),
    note: roomNote(n),
    rsvps: n.rsvps,
    ...(n.headcount !== undefined ? { came: n.headcount } : {}),
    ...(n.room !== undefined ? { room: n.room } : {}),
  }));
  const host = h("div", { class: "chart-host" });
  fitChart(host, (w) => roomBars(rows, w));
  return pane({
    key: "rooms",
    title: "How full the house was",
    line,
    span: "wide",
    body: [
      legend([
        { label: "Room", mark: "outline" },
        { label: "Came", mark: "solid" },
        { label: "Said yes", mark: "tick" },
      ]),
      host,
      asTable("rooms", {
        caption: "Room, turnout and RSVPs per night",
        head: ["Date", "Night", "Room", "Came", "Said yes"],
        rows: recent.map((n) => [longDate(n.date), n.title, orNone(n.room, "not set"), orNone(n.headcount, "not logged"), n.rsvps]),
        numeric: [false, false, true, true, true],
      }),
    ],
  });
}

export function readsPane(d: VenueDashboard): HTMLElement {
  const line = "Each column is one read of your street. Solid parts were fresh Qloo calls, hatched parts came from the cache.";
  const reads = d.reads.slice(-READ_COLUMNS);
  if (!reads.length) {
    return pane({ key: "reads", title: "Street reads", line, span: "wide", body: [empty("No street reads yet. Each read shows here with the Qloo calls it made.")] });
  }
  const host = h("div", { class: "chart-host" });
  fitChart(host, (w) =>
    columns(
      {
        name: "Street reads by date",
        series: [
          { name: "Live calls", values: reads.map((r) => r.calls), mark: "solid" },
          { name: "From cache", values: reads.map((r) => r.cached), mark: "hatched" },
        ],
        tick: (i) => dayMonth(reads[i]?.at ?? "", d.tz),
        span: (i) => stamp(reads[i]?.at ?? "", d.tz),
        maxBar: READ_COLUMN_MAX,
        height: 180,
      },
      w,
    ),
  );
  return pane({
    key: "reads",
    title: "Street reads",
    line,
    span: "wide",
    body: [
      legend([
        { label: "Live calls", mark: "solid", value: count(reads.reduce((s, r) => s + r.calls, 0)) },
        { label: "From cache", mark: "hatched", value: count(reads.reduce((s, r) => s + r.cached, 0)) },
      ]),
      host,
      asTable("reads", { caption: "Street reads", head: ["When", "Live calls", "From cache"], rows: [...reads].reverse().map((r) => [stamp(r.at, d.tz), r.calls, r.cached]), numeric: [false, true, true] }),
    ],
  });
}

function mondayRunLine(m: DashboardMonday): string {
  const p = m.proposal;
  if (!m.planned || !p) return "Read the street and drafted nothing.";
  const kind = formatName(p.format).toLowerCase();
  return `Drafted a ${kind} for ${longDate(p.date)} at ${p.start}: ${p.title}.${p.published ? " You published it." : ""}`;
}

export function mondaysPane(d: VenueDashboard): HTMLElement {
  const next = d.nextAlarm ? `Next run ${stamp(d.nextAlarm, d.tz)}.` : "No Monday run is scheduled yet.";
  const runs = [...d.mondays].reverse();
  return pane({
    key: "mondays",
    title: "Monday runs",
    line: "Every Monday at 09:00 your agent reads the street again and drafts a night. It never publishes one on its own.",
    span: "side",
    body: [
      h("p", { class: "pane-note" }, next),
      runs.length
        ? h(
            "ol",
            { class: "log" },
            runs.map((m) => h("li", { class: `log-row ${m.proposal?.published ? "log-published" : ""}` }, h("time", { datetime: m.at }, stamp(m.at, d.tz)), h("span", { class: "log-line" }, mondayRunLine(m)))),
          )
        : empty("No Monday runs yet. The first one shows here with the night it drafted."),
    ],
  });
}
