import type { AgentRun, AgentStepKey, Night, NightFormat, NightPlan, PlanInput, Venue } from "../../shared/contract.ts";
import { turnoutVerdict } from "../../shared/turnout.ts";
import { sendOwnerEmail } from "../actions/email.ts";
import { esc } from "../pages/html.ts";
import { recordEvent } from "../stats/events.ts";
import { forgetVenue, mondayEvent, planEvent } from "../stats/makers.ts";
import { FORMATS, describeDate } from "../../core/index.ts";
import { plainName, spanWords } from "../../shared/words.ts";
import { utcDay } from "../zones.ts";
import { fail, failure, noVenue, ok, type MondayRun, type Out, type VenueDeps } from "./api.ts";
import { armAlarm } from "./alarm.ts";
import { ownerLink } from "./owner.ts";
import { freshRead, qlooFor, withCopy } from "./planning.ts";
import { planWithMatch } from "./joint.ts";
import { keepRun, Tracer } from "./agent_trace.ts";
import { formatsRunWith, formatsStep, partnerStep } from "./monday_words.ts";
import type { VenueRecords } from "./records.ts";

const DAY_MS = 86_400_000;
const ALL_FORMATS = Object.keys(FORMATS).length;
export { DELETE_AFTER_DAYS, PAUSE_AFTER_DAYS } from "../../shared/engine.ts";
import { DELETE_AFTER_DAYS, PAUSE_AFTER_DAYS } from "../../shared/engine.ts";

// A night that drew under 40 percent of its room is not repeated the next week; one that filled 60 percent is kept in the mix.
// Formats already run with this week's partner are left out, so the partner is never asked for the same night twice.
export function mondayInput(venue: Venue, nights: Night[], partnerId?: string): PlanInput {
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
  const avoid = new Set<NightFormat>(formatsRunWith(nights, partnerId));
  if (last && verdict?.next === "change_format") avoid.add(last.format);
  if (avoid.size && avoid.size < ALL_FORMATS) input.avoidFormats = [...avoid];
  if (last && verdict?.next === "keep_format" && !avoid.has(last.format)) input.preferFormats = [last.format];
  return input;
}

async function mondayEmail(records: VenueRecords, deps: VenueDeps, venue: Venue, plan: NightPlan): Promise<string | null> {
  if (!venue.ownerEmail || !deps.resend) return "email is not set up for this venue";
  const origin = await records.origin();
  if (!origin) return "the venue has no address on record";
  if (!(await records.takeMailSlot(utcDay(deps.now())))) return "the daily mail allowance was already used";
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
  return sent.ok ? null : "the mail service refused it";
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

async function pausedRun(records: VenueRecords, deps: VenueDeps, by: AgentRun["by"]): Promise<AgentRun> {
  const tracer = new Tracer(deps.now);
  await tracer.step("pause", async () => ({
    did: "Checked whether anyone still opens the venue",
    outcome: `Nobody has opened it for ${spanWords(PAUSE_AFTER_DAYS)}, so the run stopped. It starts again when the owner opens the venue, and the venue is deleted after ${spanWords(DELETE_AFTER_DAYS)}.`,
    status: "skipped" as const,
  }));
  const run = tracer.finish(deps.newId(), by);
  await keepRun(records, run);
  return run;
}

// Refreshes the read, checks last week's partner, drafts the next night for the quiet slot and sets the next alarm. It never
// publishes. Every step is written to the run record as it happens, and that record is all the owner home shows.
export async function runMonday(records: VenueRecords, deps: VenueDeps, by: AgentRun["by"] = "alarm"): Promise<Out<MondayRun>> {
  const venue = await records.venue();
  if (!venue) return noVenue();
  const retired = await retire(records, deps, venue);
  if (retired) {
    if (retired.idle === "paused") retired.run = await pausedRun(records, deps, by);
    return ok(retired);
  }
  const tracer = new Tracer(deps.now);
  const counted = tracer.withCounts(deps);
  counted.progress?.start(deps.now());
  let current: AgentStepKey = "read";
  let planned = false;
  let emailed = false;
  let drafted: NightPlan | null = null;
  try {
    const q = qlooFor(counted, venue);
    if (!q) {
      console.warn("monday run skipped: QLOO_API_KEY is not set");
      tracer.fail("read", "Read the street again", "Qloo is not set up on this server, so nothing was read.");
    } else {
      const lastWeek = await records.match();
      const read = (await tracer.step("read", async () => {
        const fresh = await freshRead(records, counted, q, venue);
        return { fresh, did: "Read the street again", outcome: `${fresh.lovedPlaces.length} places your crowd loves nearby, ${fresh.rising.length} picks they love.` };
      })).fresh;
      current = "partner";
      const match = (await tracer.step("partner", async () => {
        const now = await records.match();
        return { match: now, ...partnerStep(lastWeek, now, deps.now()) };
      })).match;
      current = "formats";
      const nights = (await records.nights()).map((r) => r.night);
      const input = mondayInput(venue, nights, match?.partner.id);
      await tracer.step("formats", async () => formatsStep(match?.partner.name, formatsRunWith(nights, match?.partner.id), input.avoidFormats, input.preferFormats));
      current = "draft";
      const draft = await tracer.step("draft", async () => {
        const joint = await planWithMatch(records, counted, read, venue, input, "monday");
        const made = await withCopy(counted, joint.response.plan, venue, joint.read);
        const when = `${describeDate(made.date)}, ${made.start} to ${made.end}`;
        return { plan: made, alternatives: joint.response.alternatives, did: match ? `Drafted a night with ${plainName(match.partner.name)}` : "Drafted a night for the quiet slot", outcome: `"${made.copy.eventTitle}" on ${when}.` };
      });
      const plan = draft.plan;
      current = "hold";
      drafted = plan;
      planned = true;
      await tracer.step("hold", async () => {
        await records.saveProposals({ plan, alternatives: draft.alternatives, input }, input);
        recordEvent(deps.stats, planEvent(venue, plan));
        return { did: "Held the draft for the owner", outcome: "Waiting for the owner to read it. Nothing is published until they approve it." };
      });
      current = "email";
      if (venue.ownerEmail && deps.resend) {
        const why = await tracer.step("email", async () => {
          const reason = await mondayEmail(records, deps, venue, plan);
          return reason
            ? { reason, did: "Emailed the draft to the owner", outcome: `Not sent, because ${reason}.`, status: "skipped" as const }
            : { reason, did: "Emailed the draft to the owner", outcome: "Sent, with a link to review it." };
        });
        emailed = why.reason === null;
      }
    }
  } catch (err) {
    const f = failure<never>(err, "run the Monday plan");
    tracer.fail(current, "Stopped before the end", f.ok ? "Something went wrong." : (f.detail ?? f.error));
  }
  recordEvent(deps.stats, mondayEvent(venue, drafted));
  const next = await armAlarm(records, deps, venue.tz);
  const run = tracer.finish(deps.newId(), by, drafted ? { id: drafted.id, title: drafted.copy.eventTitle } : undefined);
  await keepRun(records, run);
  return ok({ planned, emailed, nextAlarm: new Date(next).toISOString(), run });
}

const OWNER_RUN_GAP_MS = 3_600_000;

// The owner's button runs the same routine as the alarm, once an hour per venue.
export async function runNow(records: VenueRecords, deps: VenueDeps): Promise<Out<MondayRun>> {
  const now = deps.now().getTime();
  const last = await records.store.get<string>("ownerRunAt");
  const wait = last ? Date.parse(last) + OWNER_RUN_GAP_MS - now : 0;
  if (wait > 0) return fail(429, "run_limit", `The agent already ran for you in the last hour. It can run for you again in ${Math.ceil(wait / 60_000)} minutes.`);
  await records.store.put("ownerRunAt", new Date(now).toISOString());
  return runMonday(records, deps, "owner");
}
