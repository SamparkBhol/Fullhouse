import type { QlooType, Rising } from "../../../shared/contract.ts";
import { listWords } from "../../copy/text.ts";
import { parseEntities, type QEntity } from "../../qloo/entities.ts";
import { locationSignal } from "../../qloo/location.ts";
import { TYPE_URN } from "../../qloo/urns.ts";
import { explainBecause, tiedToVenue } from "../because.ts";
import { rankBy } from "../rank.ts";
import type { Runner } from "../runner.ts";
import { TYPE_PLURAL } from "../words.ts";
import type { ReadContext } from "./resolve.ts";

// Video games are left out: one title tops most venues, so they add little for a night.
// bias.trends is never sent: books and video games refuse it with HTTP 400 and it changed nothing for the rest.
export const CROSS_TYPES: QlooType[] = ["artist", "book", "movie", "tv_show", "podcast"];
const PICKS_PER_TYPE = 10;

const TYPE_LABEL: Partial<Record<QlooType, string>> = {
  artist: "Artist picks",
  book: "Book picks",
  movie: "Film picks",
  tv_show: "TV show picks",
  podcast: "Podcast picks",
};

interface PickList {
  type: QlooType;
  ref: number;
  entities: QEntity[];
  tied: boolean;
}

// The venue entity plus its point is what makes the picks specific; a point alone returns the same global stars everywhere.
async function pickList(run: Runner, ctx: ReadContext, type: QlooType): Promise<PickList | null> {
  const params = {
    "filter.type": TYPE_URN[type],
    "signal.interests.entities": ctx.entityId,
    ...locationSignal(ctx.center.lat, ctx.center.lng),
    "feature.explainability": "true",
    take: String(PICKS_PER_TYPE),
  };
  const got = await run.call(`insights_${type}`, "/v2/insights", params, TYPE_LABEL[type] ?? `${TYPE_PLURAL[type]} picks`);
  if (!got) return null;
  const entities = rankBy(parseEntities(got.body), (e) => e.affinity);
  return { type, ref: got.ref, entities, tied: entities.some((e) => tiedToVenue(e, ctx)) };
}

function toRising(e: QEntity, rank: number, list: PickList, ctx: ReadContext): Rising {
  const n = list.entities.length;
  const kind = TYPE_PLURAL[list.type];
  // Without the venue in the signal the scores sit level, so the order is not presented as a ranking.
  const ranked = list.tied
    ? `Ranked #${rank} of ${n} ${kind} for people who like ${ctx.name}, weighted to the area around it`
    : `One of ${n} ${kind} Qloo returned for the area around ${ctx.name}`;
  const r: Rising = {
    id: e.id,
    name: e.name,
    type: list.type,
    rank,
    trend: "unknown",
    because: [{ kind: "affinity", text: ranked, provenance: list.ref }, ...explainBecause(e, ctx, list.ref, "pick")],
    tags: e.tags.map((t) => t.id),
  };
  if (e.image) r.image = e.image;
  if (e.url) r.url = e.url;
  return r;
}

export async function crossDomain(run: Runner, ctx: ReadContext): Promise<{ rising: Rising[]; limits: string[] }> {
  const lists = (await Promise.all(CROSS_TYPES.map((t) => pickList(run, ctx, t)))).filter((l): l is PickList => l !== null);
  const rising = lists.flatMap((l) => l.entities.map((e, i) => toRising(e, i + 1, l, ctx)));
  const empty = lists.filter((l) => !l.entities.length).map((l) => TYPE_PLURAL[l.type]);
  const areaOnly = lists.filter((l) => l.entities.length && !l.tied).map((l) => TYPE_PLURAL[l.type]);
  const limits: string[] = [];
  if (empty.length) limits.push(`Qloo returned no ${listWords(empty)} for ${ctx.name}.`);
  if (areaOnly.length) limits.push(`Qloo did not use ${ctx.name} itself for the ${listWords(areaOnly)}, so those picks reflect the area only.`);
  return { rising, limits };
}
