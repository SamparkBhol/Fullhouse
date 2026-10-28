import type { CreateVenueInput, Venue, VenueCandidate } from "../../shared/contract.ts";
import { sendOwnerEmail } from "../actions/email.ts";
import { randomBase64url } from "../crypto.ts";
import { ownerToken, ownerUrl, timingSafeEqual, verifyOwnerToken } from "../owner_token.ts";
import { esc } from "../pages/html.ts";
import { recordEvent } from "../stats/events.ts";
import { utcDay } from "../zones.ts";
import { fail, noVenue, ok, type Out, type VenueDeps } from "./api.ts";
import { armAlarm } from "./alarm.ts";
import type { EmailCode, VenueRecords } from "./records.ts";

const CODE_TTL_MS = 2 * 86_400_000;

export async function ownerLink(records: VenueRecords, deps: VenueDeps, venue: Venue, origin: string): Promise<string> {
  return ownerUrl(origin, venue.id, await ownerToken(deps.secret, venue.id, await records.authNonce()));
}

export async function checkOwner(records: VenueRecords, deps: VenueDeps, venueId: string, token: string | null): Promise<boolean> {
  return verifyOwnerToken(deps.secret, venueId, await records.authNonce(), token);
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// An address on the venue's own website domain shows the person works there, so the venue counts as confirmed.
export function confirmsVenue(email: string, candidate: VenueCandidate): boolean {
  const host = hostOf(candidate.url);
  const domain = email.split("@")[1]?.toLowerCase();
  return Boolean(host && domain && domain === host);
}

async function sendConfirmation(records: VenueRecords, deps: VenueDeps, venue: Venue, origin: string): Promise<void> {
  const email = venue.pendingEmail;
  if (!email || !deps.resend || !(await records.takeMailSlot(utcDay(deps.now())))) return;
  const code = randomBase64url(32);
  await records.store.put("emailCode", { email, code, at: deps.now().toISOString() } satisfies EmailCode);
  const link = `${origin}/v/${venue.id}/confirm#c=${code}`;
  const sent = await sendOwnerEmail(
    deps.resend,
    email,
    {
      subject: `Confirm your email for ${venue.entity.name} on Full House`,
      text: [`Someone set up ${venue.entity.name} on Full House with this address.`, "", `If it was you, open this link on the phone that holds your owner link: ${link}`, "If it was not you, ignore this email and nothing more is sent."].join("\n"),
      html: `<p>Someone set up ${esc(venue.entity.name)} on Full House with this address.</p><p>If it was you, <a href="${esc(link)}">confirm it</a> on the phone that holds your owner link.</p><p>If it was not you, ignore this email and nothing more is sent.</p>`,
    },
    deps.fetch,
  );
  if (!sent.ok) console.warn("confirmation email failed", sent.reason);
}

export async function initVenue(
  records: VenueRecords,
  deps: VenueDeps,
  id: string,
  input: CreateVenueInput,
  candidate: VenueCandidate,
  origin: string,
): Promise<Out<{ venue: Venue; ownerToken: string }>> {
  if (await records.venue()) return fail(409, "venue_exists", "This venue is already set up.");
  const now = deps.now().toISOString();
  const venue: Venue = { id, entity: candidate, city: input.city, tz: input.tz, quietSlot: input.quietSlot, createdAt: now, verified: false };
  if (input.capacity !== undefined) venue.capacity = input.capacity;
  if (input.ownerEmail && deps.resend) venue.pendingEmail = input.ownerEmail;
  if (input.noLiveMusic !== undefined) venue.noLiveMusic = input.noLiveMusic;
  const nonce = randomBase64url(16);
  await records.store.put("auth", nonce);
  await records.store.put("venue", venue);
  await records.store.put("meta", { origin });
  await records.store.put("lastSeen", now);
  await armAlarm(records, deps, venue.tz);
  await sendConfirmation(records, deps, venue, origin);
  recordEvent(deps.stats, { kind: "venue_created", venueId: id });
  return ok({ venue, ownerToken: await ownerToken(deps.secret, id, nonce) });
}

export async function rotateOwnerLink(records: VenueRecords, deps: VenueDeps, origin: string): Promise<Out<{ ownerUrl: string; ownerToken: string }>> {
  const venue = await records.venue();
  if (!venue) return noVenue();
  const nonce = randomBase64url(16);
  await records.store.put("auth", nonce);
  const token = await ownerToken(deps.secret, venue.id, nonce);
  return ok({ ownerUrl: ownerUrl(origin, venue.id, token), ownerToken: token });
}

export async function confirmEmail(records: VenueRecords, deps: VenueDeps, code: string): Promise<Out<Venue>> {
  const venue = await records.venue();
  if (!venue) return noVenue();
  const pending = await records.store.get<EmailCode>("emailCode");
  const fresh = pending && deps.now().getTime() - Date.parse(pending.at) < CODE_TTL_MS;
  if (!pending || !fresh || pending.email !== venue.pendingEmail || !timingSafeEqual(pending.code, code)) {
    return fail(400, "code_not_valid", "That confirmation link is not valid any more. Set the email again from your venue page.");
  }
  const { pendingEmail: _drop, ...rest } = venue;
  const confirmed: Venue = { ...rest, ownerEmail: pending.email, verified: venue.verified || confirmsVenue(pending.email, venue.entity) };
  await records.store.put("venue", confirmed);
  await records.store.delete("emailCode");
  return ok(confirmed);
}

export async function requestEmail(records: VenueRecords, deps: VenueDeps, email: string, origin: string): Promise<Out<Venue>> {
  const venue = await records.venue();
  if (!venue) return noVenue();
  if (!deps.resend) return fail(503, "email_off", "Email is off on this server, so there is nothing to confirm.");
  const next: Venue = { ...venue, pendingEmail: email };
  await records.store.put("venue", next);
  await sendConfirmation(records, deps, next, origin);
  return ok(next);
}
