import { z } from "zod";
import type { ActionKind, InviteAnswer, NightFormat, PlanInput, QuietSlot, VenueSettingsInput } from "../shared/contract.ts";
import { isEmail } from "./actions/links.ts";
import { NIGHT_ID_RE } from "./ids.ts";
import { isValidTimeZone } from "../core/index.ts";

export const FORMATS = ["listening", "film", "quiz", "book", "games", "podcast", "tasting"] as const satisfies readonly NightFormat[];
export const ACTIONS = ["event_page", "poster", "ics", "gcal", "outreach", "eventbrite", "owner_email"] as const satisfies readonly ActionKind[];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use 24 hour HH:MM");
const weekday = z.number().int().min(0).max(6).transform((n) => n as QuietSlot["weekday"]);
const text = (max: number) => z.string().trim().min(1).max(max);
const email = z.string().trim().max(254).refine((v) => isEmail(v), "not an email address");

// A position from the browser, used for one search and never kept.
const near = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export const SearchSchema = z
  .object({ name: text(120), city: z.string().trim().max(120).optional(), near: near.optional() })
  .refine((v) => Boolean(v.near || v.city), "give a city or a position");

export const QuietSlotSchema = z.object({
  weekday,
  start: hhmm,
  durationMin: z.number().int().min(30).max(720),
});

export const CreateVenueSchema = z.object({
  candidate: z.object({ id: text(80), name: text(200) }),
  city: text(120),
  near: near.optional(),
  tz: z.string().trim().refine((tz) => tz.length <= 64 && isValidTimeZone(tz), "not a known time zone"),
  quietSlot: QuietSlotSchema,
  capacity: z.number().int().min(1).max(5000).optional(),
  ownerEmail: email.optional(),
  noLiveMusic: z.boolean().optional(),
  assumed: z.object({ slot: z.boolean().optional(), room: z.boolean().optional() }).optional(),
  via: z.string().regex(/^[a-z0-9-]{1,120}$/).optional(),
});

const house = z.object({ music: z.boolean().optional(), stage: z.boolean().optional(), spoken: z.boolean().optional() });

export const SettingsSchema = z.object({
  quietSlot: QuietSlotSchema.optional(),
  capacity: z.number().int().min(1).max(5000).nullable().optional(),
  house: house.optional(),
  contact: z.string().trim().max(120).nullable().optional(),
});

export const EditSchema = z.object({
  copy: z.object({
    eventTitle: z.string().max(200).optional(),
    eventDescription: z.string().max(2000).optional(),
    posterHeadline: z.string().max(200).optional(),
    posterSub: z.string().max(300).optional(),
  }),
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
  partnerEmails: z.record(z.string().regex(/^[A-Za-z0-9:_-]{1,80}$/), email).optional(),
  copy: z
    .object({
      eventTitle: z.string().max(200).optional(),
      eventDescription: z.string().max(2000).optional(),
      posterHeadline: z.string().max(200).optional(),
      posterSub: z.string().max(300).optional(),
    })
    .optional(),
});

const qlooId = z.string().trim().regex(/^[A-Za-z0-9-]{1,80}$/, "not a Qloo place id");

export const MatchSchema = z.object({ partnerId: qlooId.optional() });

export const InviteSchema = z.object({ partnerId: qlooId });

// A form posts checkboxes as "on"; a script posts booleans. Both mean yes.
const tick = z.union([z.boolean(), z.string()]).transform((v) => v === true || v === "on" || v === "true" || v === "yes");

export const AnswerSchema = z.object({
  answer: z.enum(["yes", "no"]),
  start: z.union([hhmm, z.literal("")]).optional(),
  what: z.string().trim().max(200).transform((v) => v.slice(0, 120)).optional(),
  tellsRegulars: tick.optional(),
  open: tick.optional(),
  contact: z.string().trim().max(120).optional(),
});

export function cleanAnswer(input: z.infer<typeof AnswerSchema>): InviteAnswer {
  const out: InviteAnswer = { answer: input.answer };
  if (input.start) out.start = input.start;
  if (input.what) out.what = input.what;
  if (input.tellsRegulars !== undefined) out.tellsRegulars = input.tellsRegulars;
  if (input.open !== undefined) out.open = input.open;
  if (input.contact) out.contact = input.contact;
  return out;
}

export function cleanSettings(input: z.infer<typeof SettingsSchema>): VenueSettingsInput {
  const out: VenueSettingsInput = {};
  if (input.quietSlot) out.quietSlot = input.quietSlot;
  if (input.capacity !== undefined) out.capacity = input.capacity;
  if (input.house) out.house = Object.fromEntries(Object.entries(input.house).filter(([, v]) => v !== undefined));
  if (input.contact !== undefined) out.contact = input.contact;
  return out;
}

export const EmailSchema = z.object({ email });

export const ConfirmSchema = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/, "that is not a confirmation code") });

export const ResultSchema = z.object({
  headcount: z.number().int().min(0).max(100000),
  note: z.string().trim().max(500).optional(),
  capacity: z.number().int().min(1).max(5000).optional(),
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
