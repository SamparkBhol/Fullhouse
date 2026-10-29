import type { Because, NightPlan, Provenance } from "../../../src/shared/contract.ts";
import { h } from "../dom.ts";
import { prettyTag } from "../format.ts";
import { receiptPart } from "./fold.ts";
import { ownReasons, sharedLine } from "./lists.ts";
import { pickLine } from "./lines.ts";
import { receiptsDrawer } from "./receipts.ts";

function whyPart(plan: NightPlan, venueName: string, calls: Provenance[], tz: string): HTMLElement {
  const f = plan.feature;
  const featureTexts = new Set((f?.because ?? []).map((b) => b.text));
  const rest: Because[] = plan.why.filter((b) => !featureTexts.has(b.text) && !b.text.startsWith("The playlist"));
  return receiptPart({
    heading: "Why this night",
    plain: [
      f && f.venueSignal !== false
        ? `${f.name} is ${pickLine(f)} on the list Qloo answered for people who like ${venueName}. The night is built from the read, and every line here points at the call it came from.`
        : "The night is built from the read, and every line here points at the call it came from.",
    ],
    parts: [
      { heading: f?.name, because: f?.because ?? [] },
      { heading: "The rest of the night", because: rest },
    ],
    calls,
    tz,
  });
}

function themePart(plan: NightPlan, calls: Provenance[], tz: string): HTMLElement | null {
  if (!plan.themeTags.length) return null;
  return receiptPart(
    { heading: "The theme", plain: ["The night's theme is the set of Qloo tags the partners, the menu and the words are matched against."], calls, tz },
    h("ul", { class: "theme-tags" }, plan.themeTags.map((t) => h("li", null, prettyTag(t.name)))),
  );
}

export function nightReceipts(plan: NightPlan, venueName: string, calls: Provenance[], tz: string): HTMLElement {
  const shared = sharedLine(plan.partners);
  const playlistWhy = plan.why.filter((b) => b.text.startsWith("The playlist"));
  return receiptsDrawer({
    calls,
    tz,
    limits: plan.limits,
    parts: [
      whyPart(plan, venueName, calls, tz),
      themePart(plan, calls, tz),
      plan.partners.length
        ? receiptPart({
            heading: "Walking over",
            plain: ["Partners come from the places nearby your audience loves. Full House prefers ones tagged with this night's theme and leaves out places that do what you do, unless nothing else came back."],
            parts: [{ because: shared ? [shared] : [] }, ...plan.partners.map((p) => ({ heading: p.name, because: ownReasons(p, shared) }))],
            calls,
            tz,
          })
        : null,
      plan.menuIdeas.length
        ? receiptPart({ heading: "On the counter", plain: ["Each idea comes from a tag the street or your audience carries."], parts: plan.menuIdeas.map((m) => ({ heading: m.text, because: m.because })), calls, tz })
        : null,
      plan.playlist.length
        ? receiptPart({ heading: "On the speakers", plain: ["The playlist is the artists Qloo ranked for your audience, in that order."], parts: [{ because: playlistWhy }], calls, callNames: ["insights_artist"], tz })
        : null,
    ],
  });
}
