import type { Night, NightPlan, PlanInput, Venue } from "../../shared/contract.ts";
import { sendOwnerEmail } from "../actions/email.ts";
import { esc } from "../pages/html.ts";
import { longDate } from "../zones.ts";
import { failure, noVenue, ok, type Out, type VenueDeps } from "./api.ts";
import { freshRead, withCopy } from "./planning.ts";
import { ownerLink } from "./publish.ts";
import type { VenueRecords } from "./records.ts";

const HOUR_MS = 3_600_000;

// A night that drew under 40 percent of capacity is not repeated the next week.
export function mondayInput(venue: Venue, nights: Night[]): PlanInput {
  const input: PlanInput = {
    weekday: venue.quietSlot.weekday,
    start: venue.quietSlot.start,
    durationMin: venue.quietSlot.durationMin,
  };
  if (venue.capacity) input.maxPeople = venue.capacity;
  if (venue.noLiveMusic) input.noLiveMusic = true;
  const last = nights
    .filter((n) => n.status === "done" && typeof n.headcount === "number")
    .sort((a, b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`))[0];
  if (last && venue.capacity && (last.headcount ?? 0) < venue.capacity * 0.4) input.avoidFormats = [last.format];
  return input;
}

export async function armAlarm(records: VenueRecords, deps: VenueDeps, tz: string): Promise<number> {
  const now = deps.now();
  let next = deps.core.nextMondayNine(tz, now).getTime();
  if (!Number.isFinite(next) || next <= now.getTime() + 60_000) {
    next = deps.core.nextMondayNine(tz, new Date(now.getTime() + HOUR_MS)).getTime();
  }
  await records.store.setAlarm(next);
  return next;
}

async function mondayEmail(records: VenueRecords, deps: VenueDeps, venue: Venue, plan: NightPlan): Promise<boolean> {
  if (!venue.ownerEmail || !deps.resend) return false;
  const meta = await records.store.get<{ origin: string }>("meta");
  if (!meta?.origin) return false;
  const link = await ownerLink(deps, venue, meta.origin);
  const when = `${longDate(plan.date)}, ${plan.start} to ${plan.end}`;
  const sent = await sendOwnerEmail(
    deps.resend,
    venue.ownerEmail,
    {
      subject: `Next quiet night idea for ${venue.entity.name}`,
      text: [
        `Full House read your street again this morning and planned "${plan.copy.eventTitle}" for ${when}.`,
        "Nothing is published until you approve it.",
        "",
        `Review it: ${link}`,
        "Keep this link to yourself. Anyone who has it can manage your venue.",
      ].join("\n"),
      html:
        `<p>Full House read your street again this morning and planned <strong>${esc(plan.copy.eventTitle)}</strong> for ${esc(when)}.</p>` +
        `<p>Nothing is published until you approve it.</p>` +
        `<p><a href="${esc(link)}">Review it</a>. Keep this link to yourself. Anyone who has it can manage your venue.</p>`,
    },
    deps.fetch,
  );
  if (!sent.ok) console.warn("monday email failed", sent.reason);
  return sent.ok;
}

// Refreshes the read, drafts the next night for the quiet slot and sets the next alarm. It never publishes.
export async function runMonday(records: VenueRecords, deps: VenueDeps): Promise<Out<{ planned: boolean; emailed: boolean; nextAlarm: string }>> {
  const venue = await records.venue();
  if (!venue) return noVenue();
  let planned = false;
  let emailed = false;
  try {
    const q = deps.qloo();
    if (q) {
      const read = await freshRead(records, deps, q, venue);
      const input = mondayInput(venue, (await records.nights()).map((r) => r.night));
      const response = deps.core.planNights(read, venue, input, deps.now(), "monday", deps.newId);
      const plan = await withCopy(deps, response.plan, venue, read);
      await records.saveProposals({ plan, alternatives: response.alternatives, input }, input);
      planned = true;
      emailed = await mondayEmail(records, deps, venue, plan);
    } else {
      console.warn("monday run skipped: QLOO_API_KEY is not set");
    }
  } catch (err) {
    failure(err, "run the Monday plan");
  }
  const next = await armAlarm(records, deps, venue.tz);
  return ok({ planned, emailed, nextAlarm: new Date(next).toISOString() });
}
