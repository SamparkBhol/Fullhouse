import type { NightFormat, PlanInput, QuietSlot } from "../../shared/contract.ts";
import { FORMAT_ORDER } from "../planner/formats.ts";
import { hhmm } from "../planner/time.ts";
import { DAYS, parseTimes } from "./keywords.ts";
import { MAX_DURATION, MAX_PEOPLE, MIN_DURATION, NOTE_MAX } from "./schema.ts";

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
  return parseTimes(s).start;
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
