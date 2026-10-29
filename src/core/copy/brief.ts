import type { NightPlan, StreetRead, Venue } from "../../shared/contract.ts";
import { TYPE_SINGULAR, plainName, shortName } from "../../shared/words.ts";
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
  // A two stop night: both places, in order, with what happens at each and every pick it is built on.
  stops?: Array<{ place: string; start: string; end: string; what: string }>;
  picks?: string[];
}

// Public copy says nothing about a partner before it agrees, so the reason the model gets is the venue's own.
function featureReason(plan: NightPlan, venue: Venue): string {
  return `a ${TYPE_SINGULAR[plan.feature?.type ?? "book"]} the people who like ${plainName(venue.entity.name)} love in Qloo's taste data`;
}

function pairBrief(plan: NightPlan): Pick<CopyBrief, "partners" | "stops" | "picks"> {
  const pair = plan.pair;
  const partner = plan.match?.partner;
  if (!pair || !partner) return { partners: [] };
  return {
    partners: [{ name: shortName(partner.name), distance: `about ${pair.stops[0]?.walkMin ?? 1} minutes on foot`, reasons: [] }],
    stops: pair.stops.map((s) => ({ place: shortName(s.name), start: s.start, end: s.end, what: s.what })),
    picks: pair.picks.map((p) => (p.by ? `${p.name} by ${p.by}` : p.name)),
  };
}

// The theme goes in as the phrases the templates use, so the model never echoes a raw tag such as "female protagonist".
// A partner is named in public only after it says yes; only a two stop night, which waits for that yes, puts one in the brief.
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
    // Partners are named only on a two stop night, which goes up once the partner has said yes.
    ...pairBrief(plan),
    // Gap notes name nearby businesses, which public copy must not mention.
    streetNotes: [],
  };
}

export function briefNames(brief: CopyBrief, plan: NightPlan, read: StreetRead): string[] {
  const names = new Set<string>([brief.venue.name, brief.venue.city, brief.venue.address ?? "", ...brief.playlist, ...brief.theme]);
  if (brief.feature) names.add(brief.feature.name);
  for (const p of brief.partners) names.add(p.name);
  for (const s of brief.stops ?? []) names.add(s.place);
  for (const p of brief.picks ?? []) names.add(p);
  for (const p of [...(plan.pair?.picks ?? []), ...(plan.feature ? [plan.feature] : [])]) if (p.by) names.add(p.by);
  if (plan.pair && plan.match?.partner) names.add(plan.match.partner.name);
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
