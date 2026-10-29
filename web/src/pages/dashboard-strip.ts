import type { VenueDashboard } from "../../../src/shared/stats.ts";
import { counter, saying } from "../charts/counter.ts";
import { clockTime, count } from "../charts/time.ts";
import { h, replace, uid } from "../dom.ts";
import { ticket } from "../router.ts";
import { dashboardPath } from "./dashboard.ts";
import { startPolling } from "./live-poll.ts";

const EVERY_MS = 30_000;
const WEEK_MS = 7 * 86_400_000;

function lastTurnout(d: VenueDashboard): HTMLElement {
  const last = [...d.nights].filter((n) => n.headcount !== undefined).pop();
  if (!last || last.headcount === undefined) return h("span", { class: "strip-none" }, "None logged yet");
  return last.room
    ? h("span", { class: "strip-figure figure" }, count(last.headcount), h("span", { class: "strip-unit" }, ` of ${count(last.room)}`))
    : h("span", { class: "strip-figure figure" }, count(last.headcount), h("span", { class: "strip-unit" }, " came"));
}

function readsThisWeek(d: VenueDashboard, now: number): number {
  return d.reads.filter((r) => now - Date.parse(r.at) <= WEEK_MS).length;
}

function cell(label: string, ...value: (Node | string)[]): HTMLElement {
  return h("div", { class: "strip-cell figures-cell" }, h("dt", null, label), h("dd", null, ...value));
}

// The owner home's view of the Numbers tab: the next night's yes count, the last turnout and this week's reads.
// With a night out, its yes count already sits above the strip, so the strip leaves that figure out.
export function numbersStrip(id: string, token: string, tz: string, nightAbove = false, onRsvps?: (n: number) => void): HTMLElement {
  const rsvps = counter(saying("RSVP", "RSVPs", " for your next night"), "you");
  const cells = h("dl", { class: "figures strip-cells" });
  const when = h("p", { class: "strip-when", hidden: true });
  const fill = (d: VenueDashboard): void => {
    if (d.next) {
      rsvps.set(d.next.rsvps);
      onRsvps?.(d.next.rsvps);
    }
    const next = d.next ? [rsvps.el, h("span", { class: "strip-unit", "aria-hidden": "true" }, "said yes")] : [h("span", { class: "strip-none" }, "None out yet")];
    replace(
      cells,
      nightAbove ? null : cell("Next night", ...next),
      cell("Last turnout", lastTurnout(d)),
      cell("Reads this week", h("span", { class: "strip-figure figure" }, count(readsThisWeek(d, Date.now())))),
    );
  };
  startPolling<VenueDashboard>({
    ticket: ticket(),
    url: () => dashboardPath(id),
    token,
    every: () => EVERY_MS,
    onData: fill,
    // Only a failed check is worth a line; a working one shows in the numbers themselves.
    onState: (s) => {
      when.hidden = s.kind !== "failed";
      if (s.kind === "failed") when.textContent = `The check at ${clockTime(s.at, tz)} failed. ${s.detail}`;
    },
  });
  const titleId = uid("strip-title");
  return h(
    "section",
    { class: "panel numbers-strip", "aria-labelledby": titleId },
    h("div", { class: "panel-head" }, h("h2", { class: "strip-title", id: titleId }, "Your numbers"), h("a", { class: "link-btn strip-open", href: `/v/${encodeURIComponent(id)}/dashboard` }, "Open your numbers")),
    cells,
    when,
  );
}
