import type { Runner } from "../runner.ts";
import { fetchFingerprint, tagModeParams, type Fingerprint } from "./fingerprint.ts";
import type { ReadContext } from "./resolve.ts";
import { STREET_TAG_TYPES } from "./street_tags.ts";

export const VENUE_TAG_TYPES = [...STREET_TAG_TYPES, "urn:tag:keyword:media", "urn:tag:cuisine:qloo", "urn:tag:good_for:qloo"];

export async function venueFingerprint(run: Runner, ctx: ReadContext): Promise<{ audience: Fingerprint | null; limits: string[] }> {
  const params = { ...tagModeParams(VENUE_TAG_TYPES, 40), "signal.interests.entities": ctx.entityId };
  const fp = await fetchFingerprint(run, "venue_tags", params, "Venue audience tags");
  if (!fp) return { audience: null, limits: [] };
  if (!fp.tags.length) return { audience: null, limits: [`No audience taste tags came back for ${ctx.name}.`] };
  return { audience: fp, limits: [] };
}
