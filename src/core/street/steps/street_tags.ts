import { locationSignal } from "../../qloo/location.ts";
import type { Runner } from "../runner.ts";
import { fetchFingerprint, tagModeParams, type Fingerprint } from "./fingerprint.ts";
import type { ReadContext } from "./resolve.ts";

// A location signal answers in these five namespaces only; keyword, cuisine and good_for come back for an entity signal.
export const STREET_TAG_TYPES = [
  "urn:tag:genre:place",
  "urn:tag:ambience:qloo",
  "urn:tag:specialty_dish:place",
  "urn:tag:genre:media",
  "urn:tag:genre:music",
];

// Street tag affinity for a location sits between about 0.95 and 1, so close scores are common.
const LEVEL_SPREAD = 0.05;

export async function streetFingerprint(run: Runner, ctx: ReadContext): Promise<{ street: Fingerprint | null; limits: string[] }> {
  const params = { ...tagModeParams(STREET_TAG_TYPES, 25), ...locationSignal(ctx.center.lat, ctx.center.lng) };
  const fp = await fetchFingerprint(run, "street_tags", params, "Street taste tags");
  if (!fp) return { street: null, limits: [] };
  if (!fp.tags.length) return { street: null, limits: [`Qloo returned no taste tags for the area around ${ctx.name}.`] };
  const limits = fp.spread !== null && fp.spread < LEVEL_SPREAD ? ["Qloo scores the street's taste tags almost level, so they are shown as a set, not a ranking."] : [];
  return { street: fp, limits };
}
