import type { LovedPlace, ReverseRank } from "../../shared/contract.ts";
import { THEIR_TOP } from "../../shared/engine.ts";
import { plainName } from "../../shared/words.ts";
import { parseEntities } from "../qloo/entities.ts";
import { locationFilter } from "../qloo/location.ts";
import { TYPE_URN } from "../qloo/urns.ts";
import { sameId } from "../qloo/values.ts";
import { rankBy } from "../street/rank.ts";
import type { Runner } from "../street/runner.ts";
import { LOVED_RADIUS_M } from "../street/steps/loved_places.ts";
import type { ReadContext } from "../street/steps/resolve.ts";

export const BACK_TAKE = 50;

export interface Back {
  partnerId: string;
  rank: ReverseRank;
  // The call ref, settled into a row of the read later; null when the call did not answer.
  ref: number | null;
}

export function notChecked(partnerId: string): Back {
  return { partnerId, rank: { checked: false, rank: null, of: 0 }, ref: null };
}

// The partner's own crowd read the same way as the venue's, in the same circle round the venue,
// to see whether the venue comes up for them too.
export async function lovesBack(run: Runner, ctx: ReadContext, partner: LovedPlace): Promise<Back> {
  const got = await run.call(
    "loves_back",
    "/v2/insights",
    {
      "filter.type": TYPE_URN.place,
      ...locationFilter(ctx.center.lat, ctx.center.lng, LOVED_RADIUS_M),
      "signal.interests.entities": partner.id,
      "filter.exclude.entities": partner.id,
      take: String(BACK_TAKE),
    },
    `Places people who like ${plainName(partner.name)} love`,
  );
  if (!got) return notChecked(partner.id);
  const list = rankBy(
    parseEntities(got.body).filter((e) => !sameId(e.id, partner.id)),
    (e) => e.affinity,
  );
  const at = list.findIndex((e) => sameId(e.id, ctx.entityId));
  const top = list.slice(0, THEIR_TOP).map((e, i) => ({ id: e.id, name: e.name, rank: i + 1 }));
  return { partnerId: partner.id, rank: { checked: true, rank: at < 0 ? null : at + 1, of: list.length, top }, ref: got.ref };
}
