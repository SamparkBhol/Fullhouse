import type { NightPlan } from "../../../src/shared/contract.ts";
import { capFirst, listWords, shortName } from "../../../src/shared/words.ts";
import { h, uid } from "../dom.ts";
import { walk } from "../format.ts";
import { describingTags } from "../tags.ts";
import { cover } from "./cover.ts";
import { partnerReason } from "./lines.ts";

export const LICENCE_NOTE =
  "A personal streaming account does not cover playing music to customers. Your venue needs its own public performance licence or a business music service.";

function panel(heading: string, ...body: (Node | null)[]): HTMLElement {
  const id = uid("part");
  return h("section", { class: "panel", "aria-labelledby": id }, h("h2", { id }, heading), ...body);
}

// The words exactly as guests will read them, and who wrote them.
export function wordsPanel(plan: NightPlan): HTMLElement {
  const unverified = plan.checks?.unverified ?? [];
  const ok = plan.checks?.claimsVerified;
  return panel(
    "As it will read",
    h("h3", { class: "copy-title" }, plan.copy.eventTitle),
    h("p", { class: "pre copy-body" }, plan.copy.eventDescription),
    h("h3", { class: "copy-head" }, "Social post"),
    h("p", { class: "copy-quote" }, plan.copy.social),
    h(
      "details",
      { class: "disclose more" },
      h("summary", null, "Note to your partner"),
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
            { class: "claim" },
            ok
              ? "Every name in the copy is in the brief."
              : unverified.length
                ? `The claim check held back names that are not in the brief: ${unverified.join(", ")}. Template copy is used where they appeared.`
                : "The claim check did not pass, so the template copy is used.",
          ),
    ),
  );
}

// The planner words each idea as "Add tiramisu to the menu for the night"; the list only needs the dish.
export function dishOf(text: string): string {
  const m = /^Add (.+) to the menu for the night$/.exec(text.trim());
  return capFirst(m?.[1] ?? text);
}

export function menuPanel(plan: NightPlan): HTMLElement | null {
  if (!plan.menuIdeas.length) return null;
  return panel("On the menu", h("p", null, "From the food tags your crowd and the street carry."), h("ul", { class: "bullets" }, plan.menuIdeas.map((m) => h("li", null, dishOf(m.text)))));
}

export function playlistPanel(plan: NightPlan): HTMLElement | null {
  const names = plan.playlist.map((a) => a.name).slice(0, 8);
  if (!names.length) return null;
  return panel("The playlist", h("p", { class: "copy-quote" }, `${listWords(names)}.`), h("p", { class: "small licence" }, LICENCE_NOTE));
}

// For a night at one place, the places nearby to tell about it, each with why it was picked.
export function nearbyPanel(plan: NightPlan, venueName: string): HTMLElement | null {
  if (plan.pair || !plan.partners.length) return null;
  return panel(
    "Places nearby to tell",
    h(
      "ul",
      { class: "items" },
      plan.partners.map((p) =>
        h(
          "li",
          { class: "item" },
          cover(p, { shape: "square" }),
          h("div", null, h("span", { class: "item-name" }, shortName(p.name)), h("span", { class: "item-sub" }, partnerReason(p, venueName))),
          h("span", { class: "item-end" }, [describingTags(p.tags, 1)[0], walk(p.distanceM)].filter(Boolean).join(", ")),
        ),
      ),
    ),
  );
}
