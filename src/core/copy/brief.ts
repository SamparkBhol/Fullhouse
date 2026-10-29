import type { NightPlan, StreetRead, Venue } from "../../shared/contract.ts";
import { TYPE_SINGULAR, plainName } from "../../shared/words.ts";
import { describeDate } from "../planner/time.ts";
import { tagLabel } from "../qloo/tags.ts";
import { hostName, nightName } from "./templates.ts";
import { planTheme, themeWords } from "./theme.ts";

export interface CopyBrief {
  venue: { name: string; city: string; address?: string };
  night: { format: string; label: string; day: string; start: string; end: string };
  feature: { name: string; kind: string; trend: string; reasons: string[] } | null;
  theme: string[];
  menuIdeas: string[];
  playlist: string[];
  partners: Array<{ name: string; distance: string; reasons: string[] }>;
  streetNotes: string[];
}

// Public copy says nothing about a partner before it agrees, so the reason the model gets is the venue's own.
function featureReason(plan: NightPlan, venue: Venue): string {
  return `a ${TYPE_SINGULAR[plan.feature?.type ?? "book"]} the people who like ${plainName(venue.entity.name)} love in Qloo's taste data`;
}

// The theme goes in as the phrases the templates use, so the model never echoes a raw tag such as "female protagonist".
// Partners stay out of the brief: a partner is named in public only after it says yes, so the claim check refuses any copy that names one.
export function buildBrief(plan: NightPlan, venue: Venue, _read: StreetRead): CopyBrief {
  const place = hostName(plan, venue);
  const address = place === venue.entity.name ? venue.entity.address : plan.match?.partner.address;
  return {
    venue: { name: place, city: venue.city, ...(address ? { address } : {}) },
    night: {
      format: plan.format,
      label: nightName(plan),
      day: describeDate(plan.date),
      start: plan.start,
      end: plan.end,
    },
    feature: plan.feature
      ? {
          name: plan.feature.name,
          kind: TYPE_SINGULAR[plan.feature.type],
          trend: plan.feature.trend,
          // The model gets one plain reason without ranks; the technical Qloo lines stay on the owner's screen.
          reasons: [featureReason(plan, venue)],
        }
      : null,
    theme: themeWords(planTheme(plan, venue.city)),
    menuIdeas: plan.menuIdeas.map((m) => m.text),
    playlist: plan.playlist.map((p) => p.name),
    partners: [],
    // Gap notes name nearby businesses, which public copy must not mention.
    streetNotes: [],
  };
}

export function briefNames(brief: CopyBrief, plan: NightPlan, read: StreetRead): string[] {
  const names = new Set<string>([brief.venue.name, brief.venue.city, brief.venue.address ?? "", ...brief.playlist, ...brief.theme]);
  if (brief.feature) names.add(brief.feature.name);
  for (const p of brief.partners) names.add(p.name);
  for (const t of plan.themeTags) {
    names.add(t.name);
    names.add(tagLabel(t.id));
  }
  for (const t of [...read.streetTags, ...read.shared, ...read.gaps.map((g) => g.tag)]) {
    names.add(t.name);
    names.add(tagLabel(t.id));
  }
  return [...names].filter((n) => typeof n === "string" && n.trim() !== "");
}
