import type { Because, NightPlan, Provenance } from "../../../src/shared/contract.ts";
import { h } from "../dom.ts";
import { distance, ordinal, prettyTag, walk } from "../format.ts";
import { describingTags } from "../tags.ts";
import { listReason, ownReasons, sharedLine } from "./lists.ts";
import { openReceipt, reasons } from "./receipt.ts";
import { empty, limitsLine } from "./states.ts";

export const LICENCE_NOTE =
  "A personal streaming account does not cover playing music to customers. Your venue needs its own public performance licence or a business music service.";

function section(id: string, heading: string, ...body: (HTMLElement | (HTMLElement | null)[] | null)[]): HTMLElement {
  return h("section", { class: "block", "aria-labelledby": id }, h("h2", { id }, heading), ...body);
}

function whySection(plan: NightPlan, calls: Provenance[], tz: string): HTMLElement {
  const f = plan.feature;
  const featureTexts = new Set((f?.because ?? []).map((b) => b.text));
  const rest: Because[] = plan.why.filter((b) => !featureTexts.has(b.text));
  return section(
    "why-title",
    "Why this night",
    f
      ? h(
          "div",
          { class: "pick" },
          h("p", { class: "pick-name" }, f.name),
          h("p", { class: "meta" }, `The feature of the night, ${ordinal(f.rank)} on Qloo's list for your audience.`),
          reasons(f.because, calls, tz),
        )
      : h("p", null, "This night has no single feature. It is built around the street's taste tags below."),
    rest.length ? h("div", { class: "pick" }, h("p", { class: "pick-name" }, "The rest of the night"), reasons(rest, calls, tz)) : null,
  );
}

function partnersSection(plan: NightPlan, calls: Provenance[], tz: string): HTMLElement {
  const shared = sharedLine(plan.partners);
  return section(
    "partners-title",
    "Partners nearby",
    plan.partners.length
      ? [
          listReason(shared, calls, tz),
          h(
            "ul",
            { class: "picks" },
            plan.partners.map((p) => {
              const tags = describingTags(p.tags, 3);
              return h(
                "li",
                { class: "pick" },
                h("div", { class: "pick-head" }, h("p", { class: "pick-name" }, p.name), h("p", { class: "pick-dist" }, distance(p.distanceM))),
                h("p", { class: "meta pick-where" }, [p.address, walk(p.distanceM)].filter(Boolean).join(", ")),
                tags.length ? h("p", { class: "pick-tags" }, tags.join(", ")) : null,
                reasons(ownReasons(p, shared), calls, tz),
              );
            }),
          ),
        ]
      : empty("No loved place nearby shares this night's theme, so the plan has no partners."),
  );
}

function wordsSection(plan: NightPlan): HTMLElement {
  const unverified = plan.checks?.unverified ?? [];
  const ok = plan.checks?.claimsVerified;
  return section(
    "copy-title",
    "The words",
    h("p", { class: "written-by" }, plan.copy.writtenBy === "model" ? "Copy written by the model, names checked against the brief" : "Copy from template"),
    h(
      "p",
      { class: ok ? "claim claim-ok" : "claim claim-held" },
      ok
        ? "Every name in the copy is in the Qloo brief."
        : unverified.length
          ? `The claim check held back names that are not in the Qloo brief: ${unverified.join(", ")}. Template copy is used where they appeared.`
          : "The claim check did not pass, so the template copy is used.",
    ),
    h("h3", null, "Social post"),
    h("p", { class: "quote" }, plan.copy.social),
    h(
      "details",
      { class: "pitch" },
      h("summary", null, "Note to partners"),
      h("p", { class: "quote" }, h("strong", null, plan.copy.partnerPitch.subject)),
      h("p", { class: "quote pre" }, plan.copy.partnerPitch.body),
    ),
  );
}

export function nightEvidence(plan: NightPlan, calls: Provenance[], tz: string): HTMLElement {
  return h(
    "div",
    { class: "night-evidence" },
    whySection(plan, calls, tz),
    section(
      "theme-title",
      "Theme",
      plan.themeTags.length
        ? h("p", { class: "theme" }, plan.themeTags.map((t) => prettyTag(t.name)).join(", "))
        : h("p", { class: "meta" }, "No theme tags came with this plan."),
    ),
    partnersSection(plan, calls, tz),
    section(
      "menu-title",
      "Menu ideas",
      plan.menuIdeas.length
        ? h("ul", { class: "picks" }, plan.menuIdeas.map((m) => h("li", { class: "pick" }, h("p", { class: "pick-name" }, m.text), reasons(m.because, calls, tz))))
        : empty("The street's tags gave no menu ideas for this night."),
    ),
    section(
      "playlist-title",
      "Playlist",
      plan.playlist.length
        ? h("ol", { class: "playlist" }, plan.playlist.map((a) => h("li", null, a.name)))
        : h("p", { class: "meta" }, "Qloo returned no artists for this street, so there is no playlist."),
      h("p", { class: "note" }, LICENCE_NOTE),
    ),
    wordsSection(plan),
    limitsLine(plan.limits),
    calls.length
      ? h("p", { class: "actions" }, h("button", { class: "button button-quiet", type: "button", onclick: () => openReceipt(calls, null, { tz }) }, `All ${calls.length} Qloo calls behind this plan`))
      : null,
  );
}
