import type { Baseline } from "../../shared/contract.ts";
import { QLOO_KEY_MISSING } from "../qloo/errors.ts";
import { fail, failure, noVenue, ok, type Out, type VenueDeps } from "./api.ts";
import { qlooFor } from "./planning.ts";
import type { VenueRecords } from "./records.ts";

const AI_OFF = "The language model is not available here, so the plain model comparison cannot run.";

// The proof needs only the read: the plain model's names are checked against Qloo, and Full House's side is the read's own match.
export async function runProof(records: VenueRecords, deps: VenueDeps): Promise<Out<Baseline>> {
  const venue = await records.venue();
  if (!venue) return noVenue();
  if (!deps.generate) return fail(503, "ai_unavailable", AI_OFF);
  const q = qlooFor(deps, venue);
  if (!q) return fail(QLOO_KEY_MISSING.status, QLOO_KEY_MISSING.error, QLOO_KEY_MISSING.detail);
  const read = await records.read();
  if (!read) return fail(409, "no_read", "Run the street read first.");
  const proposals = await records.proposals();
  const nights = (await records.nights()).map((r) => r.night).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const plan = proposals[0]?.plan ?? nights[0] ?? null;
  try {
    const result = await deps.core.runBaseline(q, venue, read, plan, deps.generate, deps.model);
    await records.store.put("baseline", result);
    return ok(result);
  } catch (err) {
    return failure(err, "run the plain model comparison");
  }
}

// Run once after the first read, so the Proof tab has its answer the moment it opens.
export async function precomputeProof(records: VenueRecords, deps: VenueDeps): Promise<Out<Baseline | null>> {
  if (!deps.generate || (await records.store.get<Baseline>("baseline"))) return ok(null);
  if (!(await records.read())) return ok(null);
  return runProof(records, deps);
}
