import type { Night, NightPlan, PlanInput, Venue } from "../../shared/contract.ts";
import { turnoutVerdict } from "../../shared/turnout.ts";
import { sendOwnerEmail } from "../actions/email.ts";
import { esc } from "../pages/html.ts";
import { recordEvent } from "../stats/events.ts";
import { forgetVenue, mondayEvent, planEvent } from "../stats/makers.ts";
import { describeDate } from "../../core/index.ts";
import { utcDay } from "../zones.ts";
import { failure, noVenue, ok, type MondayRun, type Out, type VenueDeps } from "./api.ts";
import { armAlarm } from "./alarm.ts";
import { ownerLink } from "./owner.ts";
import { freshRead, qlooFor, withCopy } from "./planning.ts";
import { planWithMatch } from "./joint.ts";
import type { VenueRecords } from "./records.ts";

const DAY_MS = 86_400_000;
export const PAUSE_AFTER_DAYS = 56;
export const DELETE_AFTER_DAYS = 180;

// A night that drew under 40 percent of its room is not repeated the next week; one that filled 60 percent is kept in the mix.
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
  const verdict = last ? turnoutVerdict(last.headcount ?? 0, last.maxPeople ?? venue.capacity) : null;
  if (last && verdict?.next === "change_format") input.avoidFormats = [last.format];
  if (last && verdict?.next === "keep_format") input.preferFormats = [last.format];
  return input;
}

async function mondayEmail(records: VenueRecords, deps: VenueDeps, venue: Venue, plan: NightPlan): Promise<boolean> {
  if (!venue.ownerEmail || !deps.resend) return false;
  const origin = await records.origin();
  if (!origin || !(await records.takeMailSlot(utcDay(deps.now())))) return false;
  const link = await ownerLink(records, deps, venue, origin);
  const when = `${describeDate(plan.date)}, ${plan.start} to ${plan.end}`;
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
        "Keep this link to yourself. Anyone who has it can manage your venue. You can make a new one on your venue page at any time.",
      ].join("\n"),
      html:
        `<p>Full House read your street again this morning and planned <strong>${esc(plan.copy.eventTitle)}</strong> for ${esc(when)}.</p>` +
        `<p>Nothing is published until you approve it.</p>` +
        `<p><a href="${esc(link)}">Review it</a>. Keep this link to yourself. Anyone who has it can manage your venue. You can make a new one on your venue page at any time.</p>`,
    },
    deps.fetch,
  );
  if (!sent.ok) console.warn("monday email failed", sent.reason);
  return sent.ok;
}

async function idleDays(records: VenueRecords, venue: Venue, now: Date): Promise<number> {
  const seen = (await records.store.get<string>("lastSeen")) ?? venue.createdAt;
  return (now.getTime() - Date.parse(seen)) / DAY_MS;
}

// A venue nobody opens for eight weeks stops its Monday runs, and after six months it is deleted with everything in it.
async function retire(records: VenueRecords, deps: VenueDeps, venue: Venue): Promise<MondayRun | null> {
  const now = deps.now();
  const idle = await idleDays(records, venue, now);
  if (idle >= DELETE_AFTER_DAYS) {
    await records.store.deleteAlarm();
    await records.store.deleteAll();
    recordEvent(deps.stats, forgetVenue(venue, "all"));
    return { planned: false, emailed: false, nextAlarm: null, idle: "deleted" };
  }
  if (idle < PAUSE_AFTER_DAYS) return null;
  const cleanup = now.getTime() + (DELETE_AFTER_DAYS - idle) * DAY_MS;
  await records.store.setAlarm(cleanup);
  return { planned: false, emailed: false, nextAlarm: new Date(cleanup).toISOString(), idle: "paused" };
}

// Refreshes the read, drafts the next night for the quiet slot and sets the next alarm. It never publishes.
export async function runMonday(records: VenueRecords, deps: VenueDeps): Promise<Out<MondayRun>> {
  const venue = await records.venue();
  if (!venue) return noVenue();
  const retired = await retire(records, deps, venue);
  if (retired) return ok(retired);
  let planned = false;
  let emailed = false;
  let drafted: NightPlan | null = null;
  try {
    const q = qlooFor(deps, venue);
    if (q) {
      const read = await freshRead(records, deps, q, venue);
      const input = mondayInput(venue, (await records.nights()).map((r) => r.night));
      const joint = await planWithMatch(records, deps, read, venue, input, "monday");
      const response = joint.response;
      const plan = await withCopy(deps, response.plan, venue, joint.read);
      await records.saveProposals({ plan, alternatives: response.alternatives, input }, input);
      recordEvent(deps.stats, planEvent(venue, plan));
      drafted = plan;
      planned = true;
      emailed = await mondayEmail(records, deps, venue, plan);
    } else {
      console.warn("monday run skipped: QLOO_API_KEY is not set");
    }
  } catch (err) {
    failure(err, "run the Monday plan");
  }
  recordEvent(deps.stats, mondayEvent(venue, drafted));
  const next = await armAlarm(records, deps, venue.tz);
  return ok({ planned, emailed, nextAlarm: new Date(next).toISOString() });
}
