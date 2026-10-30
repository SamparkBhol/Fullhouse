import { FORMATS, describeDate } from "../../core/index.ts";
import { reasonWords } from "../../shared/answers.ts";
import { ERROR_WORDS, type StatEventKind } from "../../shared/stats.ts";
import type { StampedEvent, StatEvent } from "./events.ts";

const NAME_MAX = 80;

// Venue names come from Qloo, but they are still trimmed and stripped of control characters.
export function cleanName(name: string): string {
  const flat = name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > NAME_MAX ? `${flat.slice(0, NAME_MAX - 1)}.` : flat || "A venue";
}

function nightKind(format: string): string {
  return FORMATS[format as keyof typeof FORMATS]?.label ?? "night";
}

function calls(n: number): string {
  return `${n} call${n === 1 ? "" : "s"}`;
}

// Anyone can set up any venue, so the log names one only after it has confirmed it runs its page, and then
// only on the lines a public event page already shows. Drafts, reads and plans never carry a name.
export function lineFor(e: StatEvent): string | null {
  switch (e.kind) {
    case "venue_created":
      return "A venue was set up.";
    case "street_read":
      return `Read the street around a venue: ${calls(e.calls)} for taste data, ${e.cached} answered from cache.`;
    case "plan_made": {
      const who = e.copy === "model" ? "Copy written by the model." : "Copy from template.";
      if (e.origin === "refine") return `Changed a plan at the owner's request. ${who}`;
      return `Planned a ${nightKind(e.format)} for a venue. ${who}`;
    }
    case "night_published":
      return e.verified
        ? `${cleanName(e.venue)} published a ${nightKind(e.format)} for ${describeDate(e.date)}.`
        : `Published a ${nightKind(e.format)} for ${describeDate(e.date)} at a venue that has not confirmed it.`;
    case "rsvp":
      return e.verified ? `One more RSVP for the night at ${cleanName(e.venue)}.` : "One more RSVP for a night.";
    case "turnout":
      return e.nights ? "A venue logged the turnout of a night." : "A venue corrected the turnout of a night.";
    case "monday_run":
      return e.planned ? `A Monday run drafted a ${nightKind(e.proposal?.format ?? "")}.` : "A Monday run drafted nothing.";
    case "invite_sent":
      return "A venue asked the place down the street to share a night.";
    case "invite_answered":
      if (e.answer === "yes") return "A neighbour said yes to a shared night.";
      return e.reason ? `A neighbour said not this time to a shared night. Its reason: ${reasonWords(e.reason).toLowerCase()}.` : "A neighbour said not this time to a shared night.";
    case "mcp_call":
      return `An MCP client called ${e.tool}.`;
    case "qloo_error":
      return `A taste data call to ${e.endpoint} failed: ${ERROR_WORDS[e.error] ?? ERROR_WORDS.other}.`;
    case "qloo_call":
    case "forget_venue":
    case "budget_unused":
      return null;
  }
}

export interface LogLine {
  at: string;
  kind: StatEventKind;
  line: string;
  venue: string | null;
}

function venueOf(e: StatEvent): string | null {
  return "venueId" in e ? e.venueId : null;
}

// The same line repeated within one request, such as every call stopped by the budget, is logged once with its count.
export function logLines(events: StampedEvent[]): LogLine[] {
  const out: (LogLine & { times: number })[] = [];
  for (const e of events) {
    const line = lineFor(e);
    if (!line || e.kind === "qloo_call" || e.kind === "forget_venue" || e.kind === "budget_unused") continue;
    const venue = venueOf(e);
    const same = out.find((o) => o.kind === e.kind && o.line === line && o.venue === venue);
    if (same) same.times += 1;
    else out.push({ at: e.at, kind: e.kind, line, venue, times: 1 });
  }
  return out.map(({ times, ...l }) => (times > 1 ? { ...l, line: `${l.line} ${times} times.` } : l));
}
