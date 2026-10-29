import type { EntityRef, LovedPlace, Rising, StreetRead, Venue } from "../../shared/contract.ts";
import type { Qloo } from "../qloo/client.ts";
import { QlooError } from "../qloo/errors.ts";
import { appendRows } from "../street/append.ts";
import { createRunner } from "../street/runner.ts";
import { CROSS_TYPES, crossDomain } from "../street/steps/cross_domain.ts";
import { formatFor } from "../night/build.ts";
import { jointTypes } from "../night/grammar.ts";
import { nightSlot } from "../planner/parts.ts";
import { resolveVenue } from "../street/steps/resolve.ts";
import { SOURCE_BOOKS, sourceBooks } from "../night/source_books.ts";

export const JOINT_CAP = CROSS_TYPES.length + SOURCE_BOOKS;

export interface JointRead {
  partnerId: string;
  rising: Rising[];
  limits: string[];
  // The read with the joint calls added to its receipts, so every reason on the plan points at a row of it.
  read: StreetRead;
}

// One call per type with both venues as the signal and explainability on, so each pick carries both crowds' shares.
export async function readJoint(q: Qloo, venue: Venue, read: StreetRead, partner: LovedPlace, exclude: EntityRef[] = []): Promise<JointRead> {
  const now = q.now?.() ?? new Date();
  const ctx = resolveVenue(venue, now);
  const run = createRunner(q, JOINT_CAP, 3);
  const def = formatFor(venue, partner, nightSlot(venue, {}, now));
  const cross = await crossDomain(run, ctx, { exclude, anchors: [partner], types: jointTypes(def) });
  const v = { id: venue.entity.id, name: venue.entity.name };
  const books = def.format === "book_then_film" ? await sourceBooks(run, cross.rising, v, { id: partner.id, name: partner.name }) : [];
  if (run.answered() === 0) throw run.firstError() ?? new QlooError("server", 0, "Qloo answered none of the calls for the joint night");
  const { rows, rowOf } = run.provenance();
  const appended = appendRows(read, rows);
  const row = (ref: number) => appended.at[rowOf(ref)] ?? -1;
  const rising = [...cross.rising, ...books].map((r) => ({
    ...r,
    because: r.because.flatMap((b) => (row(b.provenance) < 0 ? [] : [{ ...b, provenance: row(b.provenance) }])),
  }));
  return { partnerId: partner.id, rising, limits: [...run.notes(), ...cross.limits], read: appended.read };
}
