import type { NightFormat, PlanInput, QuietSlot } from "../../shared/contract.ts";
import { FORMAT_ORDER } from "../planner/formats.ts";
import { hhmm } from "../planner/time.ts";

export const MIN_DURATION = 30;
export const MAX_DURATION = 360;
export const MAX_PEOPLE = 1000;
export const NOTE_MAX = 200;

export const REFINE_TOOL: { name: string; description: string; parameters: Record<string, unknown> } = {
  name: "refine_night",
  description:
    "Change the settings of a planned night at a small venue. Set only the fields the owner's request changes. Leave everything else out.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      weekday: { type: "integer", minimum: 0, maximum: 6, description: "Day of the week for the night, 0 is Sunday, 1 is Monday, 6 is Saturday." },
      start: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$", description: "Start time in 24 hour HH:MM, for example 19:30." },
      durationMin: { type: "integer", minimum: MIN_DURATION, maximum: MAX_DURATION, description: "Length of the night in minutes." },
      maxPeople: { type: "integer", minimum: 1, maximum: MAX_PEOPLE, description: "Most people the owner wants in the room." },
      avoidFormats: { type: "array", items: { type: "string", enum: FORMAT_ORDER }, description: "Night formats the owner does not want." },
      preferFormats: { type: "array", items: { type: "string", enum: FORMAT_ORDER }, description: "Night formats the owner asked for." },
      noLiveMusic: { type: "boolean", description: "True when the owner says no live music or no bands." },
      note: { type: "string", maxLength: NOTE_MAX, description: "Anything else the owner asked for, in their words." },
    },
  },
};

const DAYS: Array<[RegExp, QuietSlot["weekday"]]> = [
  [/\b(sun|sunday|sundays)\b/, 0],
  [/\b(mon|monday|mondays)\b/, 1],
  [/\b(tue|tues|tuesday|tuesdays)\b/, 2],
  [/\b(wed|weds|wednesday|wednesdays)\b/, 3],
  [/\b(thu|thur|thurs|thursday|thursdays)\b/, 4],
  [/\b(fri|friday|fridays)\b/, 5],
  [/\b(sat|saturday|saturdays)\b/, 6],
];

const FORMAT_WORDS: Array<[RegExp, NightFormat]> = [
  [/\b(listening|vinyl|records?|dj|music night)\b/, "listening"],
  [/\b(film|films|movie|movies|cinema|screening)\b/, "film"],
  [/\b(quiz|quizzes|trivia|pub quiz)\b/, "quiz"],
  [/\b(book night|book club|books|reading night|reading|author|novel|literary)\b/, "book"],
  [/\b(game night|games|gaming|video ?games?)\b/, "games"],
  [/\b(podcast|podcasts)\b/, "podcast"],
  [/\b(tasting|pairing|wine night|food night|supper)\b/, "tasting"],
];

const NEGATION = /\b(no|not|without|avoid|skip|instead of|rather than|anything but|except|nothing like|less)\s+(?:a\s+|an\s+|the\s+|more\s+)?$/;

function negatedAt(text: string, index: number): boolean {
  return NEGATION.test(text.slice(Math.max(0, index - 24), index));
}

function toMinutes(h: number, m: number, ampm: string | undefined, assumeEvening: boolean): number | null {
  if (m > 59) return null;
  let hour = h;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    if (ampm === "pm" && hour !== 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
  } else if (assumeEvening && hour >= 1 && hour <= 11) {
    hour += 12;
  }
  if (hour > 23) return null;
  return hour * 60 + m;
}

const TIME = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?`;

function parseTimes(text: string): { start?: string; durationMin?: number } {
  const norm = (s: string | undefined) => (s ? s.replace(/\./g, "") : undefined);
  const range = new RegExp(String.raw`(from\s+|between\s+)?\b${TIME}\s*(?:to|until|till|and|-)\s*${TIME}`, "i").exec(text);
  if (range) {
    const endAmPm = norm(range[7]?.toLowerCase());
    const startAmPm = norm(range[4]?.toLowerCase()) ?? endAmPm;
    const hasClock = Boolean(range[1] || range[3] || range[4] || range[6] || range[7]);
    if (hasClock) {
      const s = toMinutes(Number(range[2]), Number(range[3] ?? 0), startAmPm, true);
      const ends = [toMinutes(Number(range[5]), Number(range[6] ?? 0), endAmPm, true)];
      if (!endAmPm) ends.push(toMinutes(Number(range[5]), Number(range[6] ?? 0), undefined, false));
      if (s !== null) {
        const durs = ends
          .filter((e): e is number => e !== null)
          .map((e) => (e - s + 1440) % 1440)
          .filter((d) => d >= MIN_DURATION && d <= MAX_DURATION)
          .sort((a, b) => a - b);
        const out: { start?: string; durationMin?: number } = { start: hhmm(s) };
        if (durs[0] !== undefined) out.durationMin = durs[0];
        return out;
      }
    }
  }
  const clock = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
  if (clock) return { start: hhmm(Number(clock[1]) * 60 + Number(clock[2])) };
  const ampm = new RegExp(String.raw`\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)`, "i").exec(text);
  if (ampm) {
    const t = toMinutes(Number(ampm[1]), Number(ampm[2] ?? 0), norm(ampm[3]?.toLowerCase()), false);
    if (t !== null) return { start: hhmm(t) };
  }
  const at = /\b(?:at|start(?:s|ing)? at|from)\s+(\d{1,2})(?:\s*o'?clock)?\b(?!\s*(?:people|guests|persons|heads|max|%|minutes|mins|hours))/i.exec(text);
  if (at) {
    const t = toMinutes(Number(at[1]), 0, undefined, true);
    if (t !== null) return { start: hhmm(t) };
  }
  return {};
}

function parsePeople(text: string): number | undefined {
  const patterns: Array<[RegExp, number]> = [
    [/\b(?:under|fewer than|less than|below)\s+(\d{1,4})\b/, -1],
    [/\b(?:max(?:imum)?|at most|up to|no more than|cap(?:ped)? at|capacity(?: of)?|limit(?: of| to)?)\s+(\d{1,4})\b/, 0],
    [/\b(\d{1,4})\s*(?:people|guests|persons|heads|covers)?\s*(?:max|maximum|tops|at most)\b/, 0],
    [/\bfor\s+(\d{1,4})\s+(?:people|guests|persons)\b/, 0],
    [/\b(\d{1,4})\s+(?:people|guests|persons)\b/, 0],
  ];
  for (const [re, adjust] of patterns) {
    const m = re.exec(text);
    if (m) {
      const n = Number(m[1]) + adjust;
      if (n >= 1) return Math.min(MAX_PEOPLE, n);
    }
  }
  return undefined;
}

export function parseRefineFallback(text: string): PlanInput {
  const raw = typeof text === "string" ? text.slice(0, 500) : "";
  const t = raw.toLowerCase().replace(/[’]/g, "'");
  const out: PlanInput = {};

  const days: Array<{ index: number; day: QuietSlot["weekday"] }> = [];
  for (const [re, day] of DAYS) {
    const g = new RegExp(re.source, "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(t)) !== null) {
      const before = t.slice(Math.max(0, m.index - 8), m.index);
      if (!negatedAt(t, m.index) && !/\b(from|off)\s+$/.test(before)) days.push({ index: m.index, day });
    }
  }
  days.sort((a, b) => a.index - b.index);
  const lastDay = days[days.length - 1];
  if (lastDay) out.weekday = lastDay.day;

  const times = parseTimes(t);
  if (times.start) out.start = times.start;
  if (times.durationMin) out.durationMin = times.durationMin;

  const people = parsePeople(t);
  if (people !== undefined) out.maxPeople = people;

  if (/\b(no|without|not any|skip the|avoid)\s+(live\s+)?(music|bands?|gigs?|musicians|performers)\b|\bno live\b/.test(t)) {
    out.noLiveMusic = true;
  } else if (/\blive music (is )?(fine|ok|okay|good|welcome)\b|\bwith live music\b/.test(t)) {
    out.noLiveMusic = false;
  }

  const avoid = new Set<NightFormat>();
  const prefer = new Set<NightFormat>();
  for (const [re, format] of FORMAT_WORDS) {
    const g = new RegExp(re.source, "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(t)) !== null) {
      if (negatedAt(t, m.index)) avoid.add(format);
      else prefer.add(format);
    }
  }
  for (const f of avoid) prefer.delete(f);
  if (avoid.size) out.avoidFormats = FORMAT_ORDER.filter((f) => avoid.has(f));
  if (prefer.size) out.preferFormats = FORMAT_ORDER.filter((f) => prefer.has(f));

  const note = raw.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
  if (note) out.note = note;
  return out;
}

function asWeekday(v: unknown): QuietSlot["weekday"] | undefined {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6) return v as QuietSlot["weekday"];
  if (typeof v === "string") {
    if (/^[0-6]$/.test(v.trim())) return Number(v.trim()) as QuietSlot["weekday"];
    const lower = v.toLowerCase();
    for (const [re, day] of DAYS) if (re.test(lower)) return day;
  }
  return undefined;
}

function asStart(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  const clock = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/.exec(s);
  if (clock) return hhmm(Number(clock[1]) * 60 + Number(clock[2]));
  const t = parseTimes(s).start;
  return t;
}

function asInt(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asFormats(v: unknown): NightFormat[] | undefined {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\s]+/) : null;
  if (!list) return undefined;
  const known = new Set<string>(FORMAT_ORDER);
  const picked = new Set(list.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase()).filter((x) => known.has(x)));
  return FORMAT_ORDER.filter((f) => picked.has(f));
}

export function applyRefine(base: PlanInput, change: unknown): PlanInput {
  const out: PlanInput = { ...base };
  if (base.avoidFormats) out.avoidFormats = [...base.avoidFormats];
  if (base.preferFormats) out.preferFormats = [...base.preferFormats];
  let c: unknown = change;
  if (typeof c === "string") {
    try {
      c = JSON.parse(c);
    } catch {
      return out;
    }
  }
  if (typeof c !== "object" || c === null || Array.isArray(c)) return out;
  const o = c as Record<string, unknown>;

  const weekday = asWeekday(o.weekday);
  if (weekday !== undefined) out.weekday = weekday;
  const start = asStart(o.start);
  if (start) out.start = start;
  const dur = asInt(o.durationMin, MIN_DURATION, MAX_DURATION);
  if (dur !== undefined) out.durationMin = dur;
  const people = asInt(o.maxPeople, 1, MAX_PEOPLE);
  if (people !== undefined) out.maxPeople = people;
  if (typeof o.noLiveMusic === "boolean") out.noLiveMusic = o.noLiveMusic;
  else if (o.noLiveMusic === "true" || o.noLiveMusic === "false") out.noLiveMusic = o.noLiveMusic === "true";

  const addAvoid = asFormats(o.avoidFormats) ?? [];
  const addPrefer = asFormats(o.preferFormats) ?? [];
  const avoid = new Set<NightFormat>(out.avoidFormats ?? []);
  const prefer = new Set<NightFormat>(out.preferFormats ?? []);
  for (const f of addAvoid) {
    avoid.add(f);
    prefer.delete(f);
  }
  for (const f of addPrefer) {
    if (addAvoid.includes(f)) continue;
    prefer.add(f);
    avoid.delete(f);
  }
  if (avoid.size === FORMAT_ORDER.length) avoid.clear();
  const avoidList = FORMAT_ORDER.filter((f) => avoid.has(f));
  const preferList = FORMAT_ORDER.filter((f) => prefer.has(f));
  if (avoidList.length) out.avoidFormats = avoidList;
  else delete out.avoidFormats;
  if (preferList.length) out.preferFormats = preferList;
  else delete out.preferFormats;

  if (typeof o.note === "string") {
    const note = o.note.replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
    if (note) out.note = note;
  }
  return out;
}
