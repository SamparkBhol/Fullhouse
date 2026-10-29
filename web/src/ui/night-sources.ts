import type { Because, NightPlan, Provenance } from "../../../src/shared/contract.ts";
import { h } from "../dom.ts";
import { prettyTag } from "../format.ts";
import { pickLine } from "./lines.ts";
import { ownReasons, sharedLine } from "./lists.ts";
import { sourcePart, sourcesDrawer } from "./sources.ts";

function whyPart(plan: NightPlan, venueName: string, calls: Provenance[], tz: string): HTMLElement {
  const f = plan.feature;
  const featureTexts = new Set((f?.because ?? []).map((b) => b.text));
  const rest: Because[] = plan.why.filter((b) => !featureTexts.has(b.text) && !b.text.startsWith("The playlist"));
  return sourcePart({
    heading: "Why this night",
    plain: [
      f && f.venueSignal !== false
        ? `${f.name} is ${pickLine(f)} on the list for people who like ${venueName}. Every line here points at the call it came from.`
        : "The night is built from the read, and every line here points at the call it came from.",
    ],
    parts: [
      { ...(f?.name ? { heading: f.name } : {}), because: f?.because ?? [] },
      { heading: "The rest of the night", because: rest },
    ],
    calls,
    tz,
  });
}

function themePart(plan: NightPlan, calls: Provenance[], tz: string): HTMLElement | null {
  if (!plan.themeTags.length) return null;
  return sourcePart(
    { heading: "The theme", plain: ["The tags the night's partners, menu and words are matched against."], calls, tz },
    h("ul", { class: "tags" }, plan.themeTags.map((t) => h("li", null, prettyTag(t.name)))),
  );
}

export function nightSources(plan: NightPlan, venueName: string, calls: Provenance[], tz: string): HTMLElement {
  const shared = sharedLine(plan.partners);
  const playlistWhy = plan.why.filter((b) => b.text.startsWith("The playlist"));
  return sourcesDrawer({
    calls,
    tz,
    limits: plan.limits,
    parts: [
      whyPart(plan, venueName, calls, tz),
      themePart(plan, calls, tz),
      plan.partners.length
        ? sourcePart({
            heading: plan.pair ? "Your partner" : "Places nearby",
            plain: [plan.pair ? "Your partner comes from the places nearby your crowd loves, scored on six checks." : "Places nearby your crowd loves, preferring ones tagged with the night's theme and leaving out places that do what you do."],
            parts: [{ because: shared ? [shared] : [] }, ...plan.partners.map((p) => ({ heading: p.name, because: ownReasons(p, shared) }))],
            calls,
            tz,
          })
        : null,
      plan.menuIdeas.length ? sourcePart({ heading: "On the menu", plain: ["Each idea comes from a tag the street or your crowd carries."], parts: plan.menuIdeas.map((m) => ({ heading: m.text, because: m.because })), calls, tz }) : null,
      plan.playlist.length ? sourcePart({ heading: "The playlist", plain: ["The artists ranked for your crowd, in that order."], parts: [{ because: playlistWhy }], calls, callNames: ["insights_artist"], tz }) : null,
    ],
  });
}
