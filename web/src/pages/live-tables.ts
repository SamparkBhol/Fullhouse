import { ERROR_WORDS, RANGE_WORDS, type LoggedEvent, type StatEventKind, type StatsBody } from "../../../src/shared/stats.ts";
import { pane } from "../charts/panel.ts";
import { dataTable } from "../charts/table.ts";
import { count, longDay, stamp } from "../charts/time.ts";
import { h } from "../dom.ts";
import { empty } from "../ui/states.ts";

const KIND_WORDS: Record<StatEventKind, string> = {
  venue_created: "Venue",
  street_read: "Read",
  plan_made: "Plan",
  night_published: "Published",
  rsvp: "RSVP",
  turnout: "Turnout",
  monday_run: "Monday",
  mcp_call: "MCP",
  qloo_error: "Error",
  invite_sent: "Invite",
  invite_answered: "Answer",
};

function ms(v: number | null): string {
  return v === null ? "none" : count(v);
}

function share(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((100 * part) / whole)}%` : "none";
}

export function endpointsPane(body: StatsBody): HTMLElement {
  const errors = body.errorKinds.length
    ? `Errors by kind: ${body.errorKinds.map((e) => `${ERROR_WORDS[e.kind] ?? e.kind} ${count(e.n)}`).join(", ")}.`
    : `No Qloo errors in ${RANGE_WORDS[body.range]}.`;
  return pane({
    key: "endpoints",
    title: "Qloo endpoints",
    line: "Every Qloo endpoint called in this range. Times are for live calls, to the full answer, rounded up to the next step such as 200, 250 or 300 ms. p50 is a typical call, p95 the slow end.",
    span: "wide",
    body: [
      body.endpoints.length
        ? h(
            "div",
            { class: "table-scroll table-blocks" },
            dataTable({
              caption: `Qloo endpoints in ${RANGE_WORDS[body.range]}`,
              head: ["Endpoint", "Live calls", "From cache", "Cache share", "p50 ms", "p95 ms", "Errors"],
              rows: body.endpoints.map((e) => [e.endpoint, count(e.calls), count(e.cacheHits), share(e.cacheHits, e.calls + e.cacheHits), ms(e.p50), ms(e.p95), count(e.errors)]),
              numeric: [false, true, true, true, true, true, true],
            }),
          )
        : empty(`No Qloo calls in ${RANGE_WORDS[body.range]}. Each endpoint gets a row here once it is called.`),
      h("p", { class: "pane-note" }, errors),
    ],
  });
}

const MCP_TOOLS = "find_venue, read_street, propose_night, publish_night and log_turnout";

// The UTC date of the next Monday, today included: each venue's run is at 09:00 its own time, so some may still be ahead.
function nextMonday(now: Date): string {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ((8 - now.getUTCDay()) % 7)));
  return longDay(day.toISOString(), "UTC");
}

function agentNotes(body: StatsBody, now: Date): HTMLElement[] {
  const t = body.totals;
  const notes: string[] = [];
  if (!t.mondayRuns) {
    notes.push(
      body.allTime.venues
        ? `No Monday runs in ${RANGE_WORDS[body.range]}. The next ones are on ${nextMonday(now)} at 09:00 in each venue's own time zone.`
        : "Monday runs start once a venue is set up, at 09:00 on Monday in the venue's own time zone.",
    );
  }
  notes.push(t.mcpCalls ? `Tools called: ${body.mcpTools.map((m) => `${m.tool} ${count(m.n)}`).join(", ")}.` : `No MCP calls yet. Point an MCP client at /mcp to call ${MCP_TOOLS}.`);
  return notes.map((n) => h("p", { class: "pane-note" }, n));
}

export function agentsPane(body: StatsBody): HTMLElement {
  const t = body.totals;
  return pane({
    key: "agents",
    title: "Monday runs and MCP",
    line: "Monday runs are each venue's agent waking up on its own. MCP calls come from other apps using Full House's tools, and count only when the tool did its job.",
    span: "side",
    body: [
      h(
        "dl",
        { class: "pane-facts" },
        h("div", null, h("dt", null, "Monday runs"), h("dd", null, count(t.mondayRuns))),
        h("div", null, h("dt", null, "Drafted a night"), h("dd", null, count(t.mondayPlanned))),
        h("div", null, h("dt", null, "MCP tool calls"), h("dd", null, count(t.mcpCalls))),
      ),
      ...agentNotes(body, new Date()),
    ],
  });
}

function logRow(e: LoggedEvent, tz: string): HTMLElement {
  return h(
    "li",
    { class: `log-row log-${e.kind}` },
    h("time", { datetime: e.at }, stamp(e.at, tz)),
    h("span", { class: "log-kind" }, h("span", { class: "key", "aria-hidden": "true" }), KIND_WORDS[e.kind] ?? "Event"),
    h("span", { class: "log-line" }, e.line),
  );
}

export function logPane(body: StatsBody, tz: string): HTMLElement {
  return pane({
    key: "log",
    title: "Log",
    line: "Newest first. A venue is named only after it confirms it runs its page, and only on its published nights and RSVPs. Nothing an owner typed is ever shown.",
    span: "side",
    body: [
      body.events.length
        ? h("ol", { class: "log", tabindex: "0", "aria-label": `Log, ${count(body.events.length)} events, newest first` }, body.events.map((e) => logRow(e, tz)))
        : empty(`Nothing happened in ${RANGE_WORDS[body.range]}. Each venue set up, read, plan, night, RSVP and error shows here as it happens.`),
    ],
  });
}
