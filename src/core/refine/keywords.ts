import type { NightFormat, PlanInput, QuietSlot } from "../../shared/contract.ts";
import { FORMAT_ORDER } from "../planner/formats.ts";
import { hhmm } from "../planner/time.ts";
import { MAX_DURATION, MAX_PEOPLE, MIN_DURATION, NOTE_MAX } from "./schema.ts";

export const DAYS: Array<[RegExp, QuietSlot["weekday"]]> = [
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

export function parseTimes(text: string): { start?: string; durationMin?: number } {
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
