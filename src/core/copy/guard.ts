import type { NightCopy } from "../../shared/contract.ts";

type CopyFields = Omit<NightCopy, "writtenBy">;

const HEADLINE_MAX = 40;
// A headline that ends on one of these words was cut off, like "Master of".
const DANGLING = /\b(of|the|and|a|an|to|with|for|in|on|at|from|by|or|&)$/i;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
}

// The poster leads with the feature's own name whenever it fits; the model only gets a say when it does not.
function settleHeadline(headline: string, feature: string | null, fallback: string): string {
  if (feature && feature.length <= HEADLINE_MAX) return feature;
  const h = norm(headline);
  const cut = DANGLING.test(headline.trim()) || (!!feature && h.length < norm(feature).length && norm(feature).startsWith(h));
  return cut || !headline.trim() ? fallback : headline;
}

// A title has to say what kind of night it is, so the bare feature name is not enough.
function settleTitle(title: string, feature: string | null, venue: string, fallback: string): string {
  const t = norm(title);
  if (feature && t === norm(feature)) return fallback;
  if (!/\bnight\b|\bevening\b/.test(t) && !t.includes(norm(venue))) return fallback;
  return title;
}

export function settleModelCopy(model: CopyFields, draft: CopyFields, feature: string | null, venue: string): CopyFields {
  return {
    ...model,
    eventTitle: settleTitle(model.eventTitle, feature, venue, draft.eventTitle),
    posterHeadline: settleHeadline(model.posterHeadline, feature, draft.posterHeadline),
  };
}
