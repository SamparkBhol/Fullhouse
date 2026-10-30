import type { NightPlan, OpeningSpan, QuietSlot, Venue } from "../../../src/shared/contract.ts";
import { dayVerdict, hoursVerdict, listedHours } from "../../../src/shared/hours.ts";
import { shortName, weekdayName } from "../../../src/shared/words.ts";
import { h, uid } from "../dom.ts";
import { WEEKDAY_ORDER, dayOnly } from "../format.ts";
import { planMatch } from "../joint.ts";

type Hours = { hours?: Record<string, OpeningSpan[]> };

export function weekdayOf(date: string): number {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? 2 : d.getUTCDay();
}

interface DayRead {
  word: string;
  // The short word under the day: only where the hours are listed, so a strip never repeats "no hours".
  under: string;
  shut: boolean;
}

// "open" only where both places list hours; with the partner's missing it says only that you open.
function readDay(d: number, venue: Hours, partner: Hours | null, quiet: number): DayRead {
  const yours = listedHours(venue) !== null;
  const theirs = partner !== null && listedHours(partner) !== null;
  if (dayVerdict(venue, d) === "closed") return { word: "you are shut", under: "you shut", shut: true };
  if (partner && dayVerdict(partner, d) === "closed") return { word: "they are shut", under: "they shut", shut: true };
  if (d === quiet) return { word: "your quiet night", under: "quiet", shut: false };
  if (yours && partner && !theirs) return { word: "you are open, their hours are not listed", under: "you open", shut: false };
  if (!yours && theirs) return { word: "they are open, your hours are not listed", under: "they open", shut: false };
  return { word: yours || theirs ? "open" : "", under: yours || theirs ? "open" : "", shut: false };
}

// The week as seven evenings, both places' open and shut days marked; the night's own day is the dark one.
// With a handler each evening is a radio that plans that day instead; without one it is a plain list.
export function weekStrip(plan: NightPlan, venue: Venue, onDay: ((weekday: QuietSlot["weekday"]) => void) | null): HTMLElement {
  const partner = planMatch(plan)?.partner ?? null;
  const current = weekdayOf(plan.date);
  const reads = WEEKDAY_ORDER.map((d) => ({ d, r: readDay(d, venue.entity, partner, venue.quietSlot.weekday) }));
  const words = (d: number, r: DayRead) => [h("span", { "aria-hidden": "true" }, weekdayName(d).slice(0, 3), r.under ? h("small", null, r.under) : null), h("span", { class: "sr-only" }, `${weekdayName(d)}${r.word ? `, ${r.word}` : ""}`)];
  if (!onDay) {
    return h(
      "ul",
      { class: "days days-plain", "aria-label": "The week" },
      reads.map(({ d, r }) => h("li", { class: ["day", r.shut ? "day-shut" : "", d === current ? "day-pick" : ""].filter(Boolean).join(" "), "aria-current": d === current ? "date" : null }, h("span", { class: "day-face" }, ...words(d, r)))),
    );
  }
  const group = uid("day");
  return h(
    "fieldset",
    { class: "days-set" },
    h("legend", { class: "sr-only" }, "Pick another evening"),
    h(
      "div",
      { class: "days" },
      reads.map(({ d, r }) => {
        const id = `${group}-${d}`;
        const input = h("input", { type: "radio", name: group, id, value: String(d), checked: d === current, disabled: r.shut && d !== current });
        input.addEventListener("change", () => input.checked && onDay(d));
        return h("div", { class: r.shut ? "day day-shut" : "day" }, input, h("label", { for: id }, ...words(d, r)));
      }),
    ),
  );
}

// One plain line on why this evening: the quiet night, and whether both places are open at the start.
export function whyDay(plan: NightPlan, venue: Venue): string {
  const day = dayOnly(plan.date);
  const partner = planMatch(plan)?.partner ?? null;
  const quiet = weekdayOf(plan.date) === venue.quietSlot.weekday;
  const first = quiet ? "Your quiet night" : plan.day?.moved ? `Moved off your quiet ${weekdayName(venue.quietSlot.weekday)}` : `${day} evening`;
  if (!partner) return `${first}, from ${plan.start}.`;
  const theirs = hoursVerdict(partner, weekdayOf(plan.date), plan.pair?.stops.find((s) => s.at === "partner")?.start ?? plan.start);
  if (theirs === "open") return `${first}, and ${shortName(partner.name)} is open for its part.`;
  if (theirs === "unknown") return `${first}. ${shortName(partner.name)} lists no hours, so check with them.`;
  return `${first}.`;
}
