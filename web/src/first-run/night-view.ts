import type { NightPlan, QuietSlot, Venue } from "../../../src/shared/contract.ts";
import { listWords, weekdayName } from "../../../src/shared/words.ts";
import { h, uid } from "../dom.ts";
import { WEEKDAY_ORDER, prettyTag } from "../format.ts";
import { byLine, planMatch } from "../joint.ts";
import { flyer } from "../ui/flyer.ts";
import { shortName, splitBar } from "../ui/split-bar.ts";

function weekdayOf(date: string): number {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? 2 : d.getUTCDay();
}

function hostLine(plan: NightPlan): string | null {
  const m = planMatch(plan);
  if (!m) return null;
  const theirs = shortName(m.partner.name);
  if (m.host === "partner") return `${theirs} hosts it, and you bring your crowd.`;
  if (m.host === "venue") return `You host it, and ${theirs} brings its crowd.`;
  return `You host it together with ${theirs}.`;
}

function whyLine(plan: NightPlan, venue: Venue): string {
  const m = planMatch(plan);
  if (!m) return plan.why[0]?.text ?? `Built on what people who like ${venue.entity.name} love.`;
  const tags = m.shared.slice(0, 3).map((t) => prettyTag(t.name).toLowerCase());
  const both = `${shortName(venue.entity.name)} and ${shortName(m.partner.name)}`;
  if (!m.split) return `No pick sat near half and half for both crowds, so this is your own crowd's pick. ${tags.length ? `The two places still share ${listWords(tags)}.` : ""}`.trim();
  return tags.length ? `People who like ${both} both pick it, and the two crowds share ${listWords(tags)}.` : `People who like ${both} both pick it.`;
}

export function nightCard(plan: NightPlan, venue: Venue, ...rest: (HTMLElement | null)[]): HTMLElement {
  const m = planMatch(plan);
  const by = plan.feature ? byLine(plan.feature) : null;
  const host = hostLine(plan);
  return h(
    "div",
    { class: "first-night" },
    h("div", { class: "first-sheet" }, flyer(plan, venue, { compact: true, headingLevel: "h2" })),
    h(
      "div",
      { class: "first-night-words" },
      m?.split ? splitBar(m.split, venue.entity.name, m.partner.name, { className: "night-split" }) : null,
      h("p", { class: "night-why" }, whyLine(plan, venue)),
      by && plan.feature ? h("p", { class: "night-by" }, `${plan.feature.name} by ${by}`) : null,
      host ? h("p", { class: "night-host" }, host) : null,
      ...rest,
    ),
  );
}

// Seven day chips, Monday first; the chip for the plan's own day is pressed.
export function dayChips(plan: NightPlan, onDay: (weekday: QuietSlot["weekday"]) => void): HTMLElement {
  const group = uid("day");
  const current = weekdayOf(plan.date);
  return h(
    "fieldset",
    { class: "days" },
    h("legend", null, `Change the night. Now ${weekdayName(current)} from ${plan.start}.`),
    h(
      "div",
      { class: "day-row" },
      WEEKDAY_ORDER.map((d) => {
        const id = `${group}-${d}`;
        const input = h("input", { type: "radio", name: group, id, value: String(d), checked: d === current, class: "day-input" });
        input.addEventListener("change", () => input.checked && onDay(d));
        return h("span", { class: "day" }, input, h("label", { for: id }, h("span", { "aria-hidden": "true" }, weekdayName(d).slice(0, 3)), h("span", { class: "sr-only" }, weekdayName(d))));
      }),
    ),
  );
}
