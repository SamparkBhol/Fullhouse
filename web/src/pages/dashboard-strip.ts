import type { VenueDashboard } from "../../../src/shared/stats.ts";
import { doorCounter, saying } from "../charts/counter.ts";
import { clockTime, count } from "../charts/time.ts";
import { h, replace } from "../dom.ts";
import { ticket } from "../router.ts";
import { dashboardPath } from "./dashboard.ts";
import { startPolling } from "./live-poll.ts";

const EVERY_MS = 30_000;
const WEEK_MS = 7 * 86_400_000;

function lastTurnout(d: VenueDashboard): HTMLElement {
  const last = [...d.nights].filter((n) => n.headcount !== undefined).pop();
  if (!last || last.headcount === undefined) return h("span", { class: "strip-none" }, "None logged yet");
  return h("span", { class: "strip-figure" }, last.room ? `${count(last.headcount)} of ${count(last.room)}` : `${count(last.headcount)} came`);
}

function readsThisWeek(d: VenueDashboard, now: number): number {
  return d.reads.filter((r) => now - Date.parse(r.at) <= WEEK_MS).length;
}

function cell(label: string, ...value: (Node | string)[]): HTMLElement {
  return h("div", { class: "strip-cell" }, h("dt", null, label), h("dd", null, ...value));
}

// Venue home's window onto the Numbers tab: the next night's yes count, the last turnout and this week's reads.
// With a night out, its flyer and yes count already sit above the strip, so the strip leaves that cell out.
export function numbersStrip(id: string, token: string, tz: string, nightAbove = false, onRsvps?: (n: number) => void): HTMLElement {
  const rsvps = doorCounter(saying("RSVP", "RSVPs", " for your next night"), "lit");
  const cells = h("dl", { class: "strip-cells" });
  const when = h("p", { class: "strip-when" }, "Checking now.");
  const fill = (d: VenueDashboard): void => {
    if (d.next) {
      rsvps.set(d.next.rsvps);
      onRsvps?.(d.next.rsvps);
    }
    const next = d.next ? [rsvps.el, h("span", { class: "strip-unit" }, "said yes")] : [h("span", { class: "strip-none" }, "None out yet")];
    replace(
      cells,
      nightAbove ? null : cell("Next night", ...next),
      cell("Last turnout", lastTurnout(d)),
      cell("Reads this week", h("span", { class: "strip-figure" }, count(readsThisWeek(d, Date.now())))),
    );
  };
  startPolling<VenueDashboard>({
    ticket: ticket(),
    url: () => dashboardPath(id),
    token,
    every: () => EVERY_MS,
    onData: fill,
    onState: (s) => {
      if (s.kind === "fresh") when.textContent = `Checks every 30 s. Last check ${clockTime(s.at, tz)}.`;
      else if (s.kind === "failed") when.textContent = `The check at ${clockTime(s.at, tz)} failed. ${s.detail}`;
      else if (s.kind === "paused") when.textContent = "Paused while this tab is hidden.";
    },
  });
  return h(
    "section",
    { class: "numbers-strip", "aria-labelledby": "strip-title" },
    h("h2", { class: "strip-title", id: "strip-title" }, "Your numbers"),
    cells,
    h("p", { class: "strip-open" }, h("a", { href: `/v/${encodeURIComponent(id)}/dashboard` }, "Open your numbers")),
    when,
  );
}
