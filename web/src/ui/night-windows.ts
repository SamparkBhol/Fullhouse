import type { NightPlan } from "../../../src/shared/contract.ts";
import { capFirst, listWords } from "../../../src/shared/words.ts";
import { h } from "../dom.ts";
import { dayOnly } from "../format.ts";
import { chalkboard } from "./chalkboard.ts";
import { partnerReason } from "./lines.ts";
import { postcards } from "./postcard.ts";
import { ledge } from "./ledge.ts";

export const LICENCE_NOTE =
  "A personal streaming account does not cover playing music to customers. Your venue needs its own public performance licence or a business music service.";

function emptyLine(text: string): HTMLElement {
  return h("p", { class: "ledge-empty" }, text);
}

// When every partner came for the same reason, the window says it once and the cards show what each place is.
export function walkingOver(plan: NightPlan, venueName: string): HTMLElement {
  const has = plan.partners.length > 0;
  const lines = plan.partners.map((p) => partnerReason(p, venueName));
  const one = lines.length > 1 && lines.every((l) => l === lines[0]) && lines[0]?.startsWith("Tagged ") ? lines[0] : null;
  return ledge(
    { label: "Walking over", className: "ledge-walk" },
    has
      ? [
          postcards(plan.partners, (p) => (one ? null : partnerReason(p, venueName)), { across: true }),
          one ? h("p", { class: "ledge-shared" }, `Each one is ${one.charAt(0).toLowerCase()}${one.slice(1)}.`) : null,
        ]
      : emptyLine("No loved place nearby shares this night's theme, so the plan has no partners."),
  );
}

// The planner words each idea as "Add tiramisu to the menu for the night"; the board only needs the dish.
export function dishOf(text: string): string {
  const m = /^Add (.+) to the menu for the night$/.exec(text.trim());
  return capFirst(m?.[1] ?? text);
}

const VENUE_FOOD = /^\d+(st|nd|rd|th) among the food tags for people who like /;

// Ideas ranked from the venue's own food tags share one line under the board instead of one under each dish.
export function onTheCounter(plan: NightPlan, venueName: string): HTMLElement {
  const has = plan.menuIdeas.length > 0;
  const ranked = has && plan.menuIdeas.every((m) => VENUE_FOOD.test(m.because[0]?.text ?? ""));
  return ledge(
    { className: "ledge-counter" },
    chalkboard({
      title: `For ${dayOnly(plan.date)} night`,
      lines: plan.menuIdeas.map((m) => ({ text: dishOf(m.text), ...(!ranked && m.because[0] ? { note: capFirst(m.because[0].text) } : {}) })),
      empty: "The street's tags gave no menu ideas for this night.",
    }),
    ranked ? h("p", { class: "ledge-shared" }, `In the order Qloo ranks the food tags of people who like ${venueName}.`) : null,
  );
}

// One line of names is enough for the speakers; the licence note matters more than the faces.
export function onTheSpeakers(plan: NightPlan): HTMLElement {
  const names = plan.playlist.map((a) => a.name).slice(0, 6);
  return ledge(
    { label: "On the speakers", className: "ledge-speakers" },
    names.length ? h("p", { class: "speakers-line" }, `${listWords(names)}.`) : emptyLine("Qloo returned no artists for this street, so there is no playlist."),
    h("p", { class: "ledge-note" }, LICENCE_NOTE),
  );
}

// The words exactly as guests will read them, on the same pink stock as the flyer.
export function asItWillRead(plan: NightPlan): HTMLElement {
  const unverified = plan.checks?.unverified ?? [];
  const ok = plan.checks?.claimsVerified;
  return h(
    "section",
    { class: "as-read", "aria-labelledby": "copy-title" },
    h("h2", { id: "copy-title" }, "As it will read"),
    h(
      "div",
      { class: "copy-card" },
      h("h3", { class: "copy-title" }, plan.copy.eventTitle),
      h("p", { class: "copy-body pre" }, plan.copy.eventDescription),
      h("h4", { class: "copy-head" }, "Social post"),
      h("p", { class: "copy-quote" }, plan.copy.social),
      h(
        "details",
        { class: "pitch" },
        h("summary", null, "Note to partners"),
        h("p", { class: "copy-quote" }, h("strong", null, plan.copy.partnerPitch.subject)),
        h("p", { class: "copy-quote pre" }, plan.copy.partnerPitch.body),
      ),
      h(
        "div",
        { class: "copy-foot" },
        h("p", { class: "written-by" }, plan.copy.writtenBy === "model" ? "Copy written by the model, names checked against the brief" : "Copy from template"),
        plan.copy.writtenBy === "model" && ok
          ? null
          : h(
              "p",
              { class: ok ? "claim claim-ok" : "claim claim-held" },
              ok
                ? "Every name in the copy is in the Qloo brief."
                : unverified.length
                  ? `The claim check held back names that are not in the Qloo brief: ${unverified.join(", ")}. Template copy is used where they appeared.`
                  : "The claim check did not pass, so the template copy is used.",
            ),
      ),
    ),
  );
}
