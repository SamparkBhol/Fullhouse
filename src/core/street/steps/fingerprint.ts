import type { StreetTag } from "../../../shared/contract.ts";
import type { Params } from "../../qloo/request.ts";
import { parseTags } from "../../qloo/tags.ts";
import { toStreetTags } from "../rank.ts";
import type { Runner } from "../runner.ts";

export interface Fingerprint {
  tags: StreetTag[];
  ref: number;
  spread: number | null;
}

export function tagModeParams(types: string[], take: number): Params {
  return { "filter.type": "urn:tag", "filter.tag.types": types, "diversify.by": "subtype", "diversify.take": "5", take: String(take) };
}

export async function fetchFingerprint(run: Runner, call: string, params: Params, label: string): Promise<Fingerprint | null> {
  const got = await run.call(call, "/v2/insights", params, label);
  if (!got) return null;
  const tags = parseTags(got.body);
  const scores = tags.map((t) => t.score).filter((s): s is number => s !== null);
  const spread = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : null;
  return { tags: toStreetTags(tags), ref: got.ref, spread };
}
