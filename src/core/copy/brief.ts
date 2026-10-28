import type { NightPlan, StreetRead, Venue } from "../../shared/contract.ts";
import { ordinal, TYPE_SINGULAR } from "../../shared/words.ts";
import { describeDate } from "../planner/time.ts";
import { tagLabel } from "../qloo/tags.ts";
import { describeDistance } from "../street/geo.ts";
import { nightName } from "./templates.ts";
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

// The theme goes in as the phrases the templates use, so the model never echoes a raw tag such as "female protagonist".
export function buildBrief(plan: NightPlan, venue: Venue, _read: StreetRead): CopyBrief {
  return {
    venue: { name: venue.entity.name, city: venue.city, ...(venue.entity.address ? { address: venue.entity.address } : {}) },
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
          // The model gets one plain reason; the technical Qloo lines stay on the owner's screen.
          reasons: [`the ${TYPE_SINGULAR[plan.feature.type]} Qloo ranks ${ordinal(plan.feature.rank)} for people who like ${venue.entity.name}`],
        }
      : null,
    theme: themeWords(planTheme(plan, venue.city)),
    menuIdeas: plan.menuIdeas.map((m) => m.text),
    playlist: plan.playlist.map((p) => p.name),
    partners: plan.partners.map((p) => ({
      name: p.name,
      distance: describeDistance(p.distanceM),
      reasons: p.because.map((b) => b.text).slice(0, 2),
    })),
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
