import { plural } from "../../shared/words.ts";
import { ERROR_WORDS, RANGE_WORDS, STATS_MAX_AGE_S, TURNOUT_SHOWN_FROM, type StatsBody } from "../../shared/stats.ts";

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const stampFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

function row(label: string, value: string | number, note = ""): string {
  return `${label.padEnd(32)}${String(value).padStart(10)}${note ? `   ${note}` : ""}`;
}

function share(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((100 * part) / whole)} percent` : "none yet";
}

function ms(v: number | null): string {
  return v === null ? "none" : String(v);
}

function ever(n: number): string {
  return `${n} since counting began`;
}

function turnout(s: StatsBody): string[] {
  const t = s.totals;
  const nights = plural(t.turnoutNights, "night", "nights");
  if (t.turnoutPeople === null) {
    return [
      row("Nights with a turnout logged", t.turnoutNights),
      `Head counts and seats show once ${TURNOUT_SHOWN_FROM} nights are logged in a range, so no one venue's night can be read off this page.`,
    ];
  }
  const seats = t.roomSeats ? `${t.roomPeople} of ${t.roomSeats}` : "no turnout logged against a room size yet";
  return [
    row("People counted at nights", t.turnoutPeople, `${nights} logged${s.allTime.turnoutPeople === null ? "" : `, ${ever(s.allTime.turnoutPeople)}`}`),
    row("Seats filled", seats, t.roomSeats && t.roomNights ? `on ${plural(t.roomNights, "night", "nights")} with a room size` : ""),
  ];
}

function activity(s: StatsBody): string[] {
  const t = s.totals;
  return [
    "Activity",
    row("Venues set up", t.venues, ever(s.allTime.venues)),
    row("Street reads", t.streetReads, ever(s.allTime.streetReads)),
    row("Plans made", t.plans, `${t.copyModel} with copy by the model, ${t.copyTemplate} from template`),
    row("Nights published", t.nightsPublished, ever(s.allTime.nightsPublished)),
    row("RSVPs", t.rsvps, ever(s.allTime.rsvps)),
    ...turnout(s),
    row("Monday runs", t.mondayRuns, `${t.mondayPlanned} drafted a night`),
    row("MCP tool calls", t.mcpCalls, s.mcpTools.map((m) => `${m.tool} ${m.n}`).join(", ")),
  ];
}

function qloo(s: StatsBody): string[] {
  const t = s.totals;
  const b = s.budget;
  const setAside = b.counted > b.liveCalls ? `${b.counted} set aside, in blocks of ten per request` : "";
  return [
    "Qloo",
    row("Live calls", t.qlooCalls),
    row("Answered from cache", t.qlooCacheHits, `${share(t.qlooCacheHits, t.qlooCalls + t.qlooCacheHits)} of all answers`),
    row("Errors", t.qlooErrors, s.errorKinds.map((e) => `${ERROR_WORDS[e.kind] ?? e.kind} ${e.n}`).join(", ")),
    row("Live calls today", `${b.liveCalls} of ${b.budget}`, [setAside, "resets at 00:00 UTC"].filter(Boolean).join(", ")),
  ];
}

function endpoints(s: StatsBody): string[] {
  if (!s.endpoints.length) return ["Endpoints", "No Qloo calls in this range."];
  const head = `${"Endpoint".padEnd(36)}${"calls".padStart(7)}${"cache".padStart(7)}${"errors".padStart(8)}${"p50 ms".padStart(8)}${"p95 ms".padStart(8)}`;
  return [
    "Endpoints, with times rounded up to the next step such as 200, 250 or 300 ms",
    head,
    ...s.endpoints.map(
      (e) => `${e.endpoint.padEnd(36)}${String(e.calls).padStart(7)}${String(e.cacheHits).padStart(7)}${String(e.errors).padStart(8)}${ms(e.p50).padStart(8)}${ms(e.p95).padStart(8)}`,
    ),
  ];
}

function events(s: StatsBody): string[] {
  if (!s.events.length) return ["Latest events", "Nothing happened in this range."];
  return ["Latest events, newest first, UTC", ...s.events.slice(0, 40).map((e) => `${stampFormat.format(new Date(e.at)).padEnd(14)}${e.line}`)];
}

// The same numbers as /live, readable with no JavaScript, in a terminal or in Tor Browser at its safest setting.
export function renderLiveText(s: StatsBody): string {
  const head = [
    "Full House, live numbers",
    `Counts for ${RANGE_WORDS[s.range]}.`,
    s.since ? `Counting on this server since ${dayFormat.format(new Date(s.since))}.` : "Nothing has been counted on this server yet.",
    "Charts of the same numbers: /live. Other ranges: /live.txt?range=7d and /live.txt?range=30d.",
    `This answer is at most ${STATS_MAX_AGE_S[s.range]} seconds old.`,
  ];
  return [head, activity(s), qloo(s), endpoints(s), events(s)].map((block) => block.join("\n")).join("\n\n") + "\n";
}
