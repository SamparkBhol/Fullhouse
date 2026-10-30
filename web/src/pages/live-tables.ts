import { ERROR_WORDS, RANGE_WORDS, type LoggedEvent, type StatEventKind, type StatsBody } from "../../../src/shared/stats.ts";
import { mondayAt } from "../../../src/shared/words.ts";
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

// The endpoints this build calls, in the words of the How page. A row outside this list came from an earlier build.
const THIS_BUILD: Record<string, string> = {
  "/search": "/search, venue and book lookups",
  "/v2/insights urn:tag": "/v2/insights, taste tags",
  "/v2/insights urn:entity:place": "/v2/insights, places nearby and loves you back",
  "/v2/insights urn:heatmap": "/v2/insights, heat map",
  "/v2/insights urn:entity:artist": "/v2/insights, artists",
  "/v2/insights urn:entity:book": "/v2/insights, books",
  "/v2/insights urn:entity:movie": "/v2/insights, films",
  "/v2/insights urn:entity:tv_show": "/v2/insights, TV shows",
  "/v2/insights urn:entity:podcast": "/v2/insights, podcasts",
  "/v2/analysis/compare": "/v2/analysis/compare, venue against partner",
  "/entities": "/entities, the Proof tab's own picks by id",
  other: "/entities, the Proof tab's own picks by id",
};

export function endpointLabel(endpoint: string): string {
  return THIS_BUILD[endpoint] ?? `${endpoint}, from an earlier build`;
}

export function endpointsPane(body: StatsBody): HTMLElement {
  const errors = body.errorKinds.length
    ? `Errors by kind: ${body.errorKinds.map((e) => `${ERROR_WORDS[e.kind] ?? e.kind} ${count(e.n)}`).join(", ")}.`
    : `No failed calls for taste data in ${RANGE_WORDS[body.range]}.`;
  const old = body.endpoints.some((e) => !(e.endpoint in THIS_BUILD));
  return pane({
    key: "endpoints",
    title: "Taste data endpoints",
    line: "Every taste data endpoint called in this range. Times are for live calls, to the full answer, rounded up to the next step such as 200, 250 or 300 ms. p50 is a typical call, p95 the slow end. On a phone the times and errors are in the plain text page.",
    span: "wide",
    body: [
      body.endpoints.length
        ? h(
            "div",
            { class: "table-scroll table-blocks table-narrow" },
            dataTable({
              caption: `Taste data endpoints in ${RANGE_WORDS[body.range]}`,
              head: ["Endpoint", "Live calls", "From cache", "Cache share", "p50 ms", "p95 ms", "Errors"],
              rows: body.endpoints.map((e) => [endpointLabel(e.endpoint), count(e.calls), count(e.cacheHits), share(e.cacheHits, e.calls + e.cacheHits), ms(e.p50), ms(e.p95), count(e.errors)]),
              numeric: [false, true, true, true, true, true, true],
            }),
          )
        : empty(`No calls for taste data in ${RANGE_WORDS[body.range]}. Each endpoint gets a row here once it is called.`),
      h("p", { class: "pane-note" }, errors),
      old ? h("p", { class: "pane-note" }, "A row marked from an earlier build was called by a version deployed earlier in this range. This build never asks for it.") : null,
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
        ? `No Monday runs in ${RANGE_WORDS[body.range]}. The next ones are on ${nextMonday(now)} at ${mondayAt()} in each venue's own time zone.`
        : `Monday runs start once a venue is set up, at ${mondayAt()} on Monday in the venue's own time zone.`,
    );
  }
  notes.push(t.mcpCalls ? `Tools called: ${body.mcpTools.map((m) => `${m.tool} ${count(m.n)}`).join(", ")}.` : `No MCP calls yet. Point an MCP client at /mcp to call ${MCP_TOOLS}.`);
  return notes.map((n) => h("p", { class: "pane-note" }, n));
}

function fact(label: string, n: number): HTMLElement {
  return h("div", { class: "figures-cell" }, h("dt", null, label), h("dd", { class: "figure" }, count(n)));
}

export function agentsPane(body: StatsBody): HTMLElement {
  const t = body.totals;
  return pane({
    key: "agents",
    title: "Monday runs and MCP",
    line: "Monday runs are each venue's agent waking up on its own. MCP calls come from other apps using Full House's tools, and count only when the tool did its job.",
    span: "wide",
    body: [
      h(
        "dl",
        { class: "figures pane-facts" },
        fact("Monday runs", t.mondayRuns),
        fact("Drafted a night", t.mondayPlanned),
        fact("MCP tool calls", t.mcpCalls),
      ),
      ...agentNotes(body, new Date()),
    ],
  });
}

function logRow(e: LoggedEvent, tz: string): HTMLElement {
  return h(
    "li",
    { class: `log-row log-${e.kind}` },
    h("time", { class: "log-time", datetime: e.at }, stamp(e.at, tz)),
    h("span", { class: "log-kind" }, KIND_WORDS[e.kind] ?? "Event"),
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
