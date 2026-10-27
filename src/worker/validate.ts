import { z } from "zod";
import type { ActionKind, NightFormat, PlanInput, QuietSlot } from "../shared/contract.ts";
import { isEmail } from "./actions/links.ts";
import { NIGHT_ID_RE } from "./tokens.ts";
import { isTimeZone } from "./zones.ts";

export const FORMATS = ["listening", "film", "quiz", "book", "games", "podcast", "tasting"] as const satisfies readonly NightFormat[];
export const ACTIONS = ["event_page", "poster", "ics", "gcal", "outreach", "eventbrite", "owner_email"] as const satisfies readonly ActionKind[];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use 24 hour HH:MM");
const weekday = z.number().int().min(0).max(6).transform((n) => n as QuietSlot["weekday"]);
const text = (max: number) => z.string().trim().min(1).max(max);
const email = z.string().trim().max(254).refine((v) => isEmail(v), "not an email address");

export const SearchSchema = z.object({ name: text(120), city: text(120) });

export const QuietSlotSchema = z.object({
  weekday,
  start: hhmm,
  durationMin: z.number().int().min(30).max(720),
});

export const CreateVenueSchema = z.object({
  candidate: z.object({ id: text(80), name: text(200) }),
  city: text(120),
  tz: z.string().trim().refine(isTimeZone, "not a known time zone"),
  quietSlot: QuietSlotSchema,
  capacity: z.number().int().min(1).max(5000).optional(),
  ownerEmail: email.optional(),
  noLiveMusic: z.boolean().optional(),
});

export const PlanInputSchema = z.object({
  weekday: weekday.optional(),
  start: hhmm.optional(),
  durationMin: z.number().int().min(30).max(720).optional(),
  maxPeople: z.number().int().min(1).max(5000).optional(),
  avoidFormats: z.array(z.enum(FORMATS)).max(7).optional(),
  preferFormats: z.array(z.enum(FORMATS)).max(7).optional(),
  noLiveMusic: z.boolean().optional(),
  note: z.string().trim().max(300).optional(),
});

export const RefineSchema = z.object({
  planId: z.string().regex(NIGHT_ID_RE),
  request: text(500),
});

export const ApproveSchema = z.object({
  actions: z
    .array(z.enum(ACTIONS))
    .min(1)
    .max(ACTIONS.length)
    .transform((a) => [...new Set(a)]),
  partnerEmails: z.record(z.string().max(80), email).optional(),
});

export const ResultSchema = z.object({
  headcount: z.number().int().min(0).max(100000),
  note: z.string().trim().max(500).optional(),
});

export const EventbriteSchema = z.object({
  token: z
    .string()
    .trim()
    .min(6)
    .max(300)
    .regex(/^[A-Za-z0-9._~-]+$/, "that does not look like an Eventbrite token"),
});

export type Parsed<T> = { ok: true; value: T } | { ok: false; detail: string };

export function parse<T>(schema: z.ZodType<T>, data: unknown): Parsed<T> {
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, value: r.data };
  const first = r.error.issues[0];
  const where = first?.path.length ? first.path.join(".") : "body";
  return { ok: false, detail: `${where}: ${first?.message ?? "invalid"}` };
}

export function cleanPlanInput(input: z.infer<typeof PlanInputSchema>): PlanInput {
  const out: PlanInput = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}
