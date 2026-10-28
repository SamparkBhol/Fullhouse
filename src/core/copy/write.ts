import type { NightCopy, NightPlan, StreetRead, Venue } from "../../shared/contract.ts";
import { tagLabel } from "../qloo/tags.ts";
import { FORMATS, KIND_WORD } from "../planner/formats.ts";
import { describeDate } from "../planner/time.ts";
import { describeDistance } from "../street/geo.ts";
import { checkClaims } from "./claims.ts";
import { BANNED_WORDS, bannedIn, fixDashes, hasDash, listWords } from "./text.ts";

export type Generate = (system: string, user: string) => Promise<string>;

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

export function buildBrief(plan: NightPlan, venue: Venue, read: StreetRead): CopyBrief {
  return {
    venue: { name: venue.entity.name, city: venue.city, ...(venue.entity.address ? { address: venue.entity.address } : {}) },
    night: {
      format: plan.format,
      label: FORMATS[plan.format].label,
      day: describeDate(plan.date),
      start: plan.start,
      end: plan.end,
    },
    feature: plan.feature
      ? {
          name: plan.feature.name,
          kind: KIND_WORD[plan.feature.type],
          trend: plan.feature.trend,
          reasons: plan.feature.because.map((b) => b.text).slice(0, 3),
        }
      : null,
    theme: plan.themeTags.map((t) => tagLabel(t.id)),
    menuIdeas: plan.menuIdeas.map((m) => m.text),
    playlist: plan.playlist.map((p) => p.name),
    partners: plan.partners.map((p) => ({
      name: p.name,
      distance: describeDistance(p.distanceM),
      reasons: p.because.map((b) => b.text).slice(0, 2),
    })),
    streetNotes: read.gaps.slice(0, 3).map((g) => g.note),
  };
}

export function briefNames(brief: CopyBrief, plan: NightPlan, read: StreetRead): string[] {
  const names = new Set<string>([brief.venue.name, brief.venue.city, brief.venue.address ?? "", ...brief.playlist, ...brief.theme]);
  if (brief.feature) names.add(brief.feature.name);
  for (const p of brief.partners) names.add(p.name);
  for (const t of plan.themeTags) names.add(t.name);
  for (const t of [...read.streetTags, ...read.shared, ...read.gaps.map((g) => g.tag)]) {
    names.add(t.name);
    names.add(tagLabel(t.id));
  }
  return [...names].filter((n) => typeof n === "string" && n.trim() !== "");
}

export const COPY_SYSTEM_PROMPT = [
  "You write the words for one night at a small independent venue, the way its owner would tell regulars about it, in plain and specific words.",
  "Use only the facts and names in the JSON brief. Never name a person, place, work, brand or business that is not in the brief.",
  "Do not invent prices, performers, guests, prizes, offers or times.",
  "The brief comes with a plain draft. Keep its facts and write it better. Say what happens on the night and in what order, name the feature, and use one or two concrete things from the theme or menu ideas.",
  "Do not sum up the street in general terms such as people around here like film and food, and do not hedge with may or might.",
  "posterHeadline is the feature's name when the brief has a feature. posterSub is one short line in the owner's voice that makes a passer by want to come in, without the date or time, which the poster already prints.",
  "Public copy (title, description, poster, social) must not mention partner businesses. The partner pitch may.",
  "The partner pitch must describe the Qloo results as aggregate taste data for the area, never as facts about anyone's customers.",
  "Write in sentence case with plain verbs and short sentences. Times are 24 hour. Write dates as the brief gives them.",
  "Do not use em dashes, en dashes or hyphens as punctuation.",
  `Do not use these words: ${BANNED_WORDS.join(", ")}.`,
  "Return one JSON object and nothing else, with string fields eventTitle (under 60 characters), eventDescription (60 to 120 words), posterHeadline (under 40 characters), posterSub (under 90 characters), social (under 280 characters), and partnerPitch, an object with string fields subject and body (under 120 words, addressed to a nearby business, signed with the venue name).",
].join(" ");

export function copyUserPrompt(brief: CopyBrief, draft: NightCopy): string {
  const plain = {
    eventTitle: draft.eventTitle,
    eventDescription: draft.eventDescription,
    posterHeadline: draft.posterHeadline,
    posterSub: draft.posterSub,
    social: draft.social,
    partnerPitch: draft.partnerPitch,
  };
  return `Brief:\n${JSON.stringify(brief, null, 2)}\nPlain draft:\n${JSON.stringify(plain, null, 2)}\nReturn only the JSON object.`;
}

export function extractJson(text: string): unknown {
  if (typeof text !== "string") return null;
  const unfenced = text.replace(/```(?:json|JSON)?\s*([\s\S]*?)```/g, "$1");
  for (let start = unfenced.indexOf("{"); start >= 0; start = unfenced.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < unfenced.length; i++) {
      const ch = unfenced[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(unfenced.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

const LIMITS: Record<string, number> = {
  eventTitle: 80,
  eventDescription: 1200,
  posterHeadline: 60,
  posterSub: 140,
  social: 280,
  subject: 120,
  body: 1500,
};

function field(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (typeof v !== "string") return null;
  const s = fixDashes(v.trim());
  if (!s || s.length > (LIMITS[key] ?? 500) || hasDash(s)) return null;
  return s;
}

export function parseCopy(raw: string): { copy: Omit<NightCopy, "writtenBy"> } | { problem: string } {
  const obj = extractJson(raw);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { problem: "was not a JSON object" };
  const o = obj as Record<string, unknown>;
  const pitch = typeof o.partnerPitch === "object" && o.partnerPitch !== null ? (o.partnerPitch as Record<string, unknown>) : {};
  const copy = {
    eventTitle: field(o, "eventTitle"),
    eventDescription: field(o, "eventDescription"),
    posterHeadline: field(o, "posterHeadline"),
    posterSub: field(o, "posterSub"),
    social: field(o, "social"),
    subject: field(pitch, "subject"),
    body: field(pitch, "body"),
  };
  const missing = Object.entries(copy).filter(([, v]) => v === null).map(([k]) => k);
  if (missing.length) return { problem: `had missing or oversized fields (${missing.join(", ")})` };
  return {
    copy: {
      eventTitle: copy.eventTitle as string,
      eventDescription: copy.eventDescription as string,
      posterHeadline: copy.posterHeadline as string,
      posterSub: copy.posterSub as string,
      social: copy.social as string,
      partnerPitch: { subject: copy.subject as string, body: copy.body as string },
    },
  };
}

function copyText(c: Omit<NightCopy, "writtenBy">): string {
  return [c.eventTitle, c.eventDescription, c.posterHeadline, c.posterSub, c.social, c.partnerPitch.subject, c.partnerPitch.body].join("\n");
}

function keepTemplate(plan: NightPlan, why: string, unverified: string[] = []): NightPlan {
  return {
    ...plan,
    checks: { claimsVerified: plan.checks.claimsVerified, unverified },
    limits: [...plan.limits, `${why}, so the copy comes from templates.`],
  };
}

export async function writeCopy(plan: NightPlan, venue: Venue, read: StreetRead, generate: Generate | null): Promise<NightPlan> {
  if (!generate) return plan;
  const brief = buildBrief(plan, venue, read);
  const allowed = briefNames(brief, plan, read);
  let raw: string;
  try {
    raw = await generate(COPY_SYSTEM_PROMPT, copyUserPrompt(brief, plan.copy));
  } catch {
    return keepTemplate(plan, "The model did not answer");
  }
  const parsed = parseCopy(raw);
  if ("problem" in parsed) return keepTemplate(plan, `The model reply ${parsed.problem}`);
  const text = copyText(parsed.copy);
  const banned = bannedIn(text);
  if (banned.length) return keepTemplate(plan, `The model copy used words from the banned list (${banned.join(", ")})`);
  const check = checkClaims(text, allowed);
  if (!check.ok) {
    return keepTemplate(plan, `The model copy named ${listWords(check.unverified)}, which ${check.unverified.length === 1 ? "is" : "are"} not in the Qloo brief`, check.unverified);
  }
  return {
    ...plan,
    copy: { ...parsed.copy, writtenBy: "model" },
    checks: { claimsVerified: true, unverified: [] },
  };
}
