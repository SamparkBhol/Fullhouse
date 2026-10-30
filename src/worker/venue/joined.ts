import type { Invite } from "../../shared/contract.ts";
import { fail, ok, type Out, type VenueDeps } from "./api.ts";
import type { VenueRecords } from "./records.ts";

// A partner that said yes and then set up its own Full House from the link on its invite. Only the invited place
// counts, only once, and only after its yes.
export async function markJoined(records: VenueRecords, deps: VenueDeps, slug: string, entityId: string): Promise<Out<Invite>> {
  const invite = await records.inviteBySlug(slug);
  if (!invite) return fail(404, "invite_not_found");
  if (invite.status !== "accepted") return fail(409, "not_accepted");
  if (invite.partner.id.toUpperCase() !== entityId.toUpperCase()) return fail(409, "other_place");
  if (invite.joinedAt) return ok(invite);
  const joined: Invite = { ...invite, joinedAt: deps.now().toISOString() };
  await records.store.put(`invite:${invite.id}`, joined);
  return ok(joined);
}
