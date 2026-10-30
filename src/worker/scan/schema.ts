import { z } from "zod";
import type { PairFormat } from "../../shared/contract.ts";
import type { ScanRecord } from "../../shared/scan.ts";

const PAIR_FORMATS = [
  "book_then_film",
  "film_then_show",
  "screening_then_drinks",
  "book_club_then_drinks",
  "listening_party",
  "drinks_then_set",
  "show_then_drinks",
  "late_view",
  "quiz_crawl",
  "two_stop",
] as const satisfies readonly PairFormat[];

const count = z.number().int().min(0).max(100_000);
const middle = z.number().min(0).max(1000).nullable();

const TotalsSchema = z
  .object({
    venues: count,
    matched: count,
    twoWay: count,
    medianFit: middle,
    medianWalk: middle,
    openTogether: count,
    formats: z.array(z.object({ format: z.enum(PAIR_FORMATS), label: z.string().trim().min(1).max(60), n: count }).strict()).max(20),
  })
  .strict()
  .refine((t) => t.matched <= t.venues && t.twoWay <= t.matched && t.openTogether <= t.matched, "counts must fit inside the venues read");

export const ScanRecordSchema = z
  .object({
    at: z.iso.datetime(),
    calls: count,
    method: z.string().trim().min(20).max(600),
    walkMax: z.number().int().min(1).max(60),
    overall: TotalsSchema,
    cities: z.array(z.object({ city: z.string().trim().min(1).max(60), totals: TotalsSchema }).strict()).min(1).max(12),
  })
  .strict() satisfies z.ZodType<ScanRecord>;
