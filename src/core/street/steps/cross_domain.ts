import type { EntityRef, LovedPlace, QlooType, Rising } from "../../../shared/contract.ts";
import { TYPE_PLURAL, TYPE_SINGULAR, capFirst, listWords, plainName, plural } from "../../../shared/words.ts";
import { parseEntities, type QEntity } from "../../qloo/entities.ts";
import { explainSummary, type ExplainRow } from "../../qloo/explain.ts";
import { locationSignal } from "../../qloo/location.ts";
import { TYPE_URN } from "../../qloo/urns.ts";
import { sameId } from "../../qloo/values.ts";
import { parseWarnings } from "../../qloo/warnings.ts";
import { tiedToVenue } from "../because.ts";
import { rankBy } from "../rank.ts";
import type { Runner } from "../runner.ts";
import { share } from "../words.ts";
import type { ReadContext } from "./resolve.ts";

// Video games are left out: one title tops most venues, so they add little for a night.
// bias.trends is never sent: books and video games refuse it with HTTP 400 and it changed nothing for the rest.
export const CROSS_TYPES: QlooType[] = ["artist", "book", "movie", "tv_show", "podcast"];
const PICKS_PER_TYPE = 10;
export interface CrossInput {
  exclude: EntityRef[];
  // Places read beside the venue as signals. The street read sends none, so its picks are the venue's own;
  // the joint night sends the one partner, so explainability can split each pick between the two crowds.
  anchors: LovedPlace[];
  // The joint night only reads the types its format needs.
  types?: QlooType[];
}

interface PickList {
  type: QlooType;
  ref: number;
  entities: QEntity[];
  tied: boolean;
  summary: ExplainRow[];
  ignored: string[];
}

// The venue entity plus its point is what makes the picks specific; a point alone returns the same global stars everywhere.
async function pickList(run: Runner, ctx: ReadContext, type: QlooType, anchors: LovedPlace[], exclude: EntityRef[]): Promise<PickList | null> {
  const params = {
    "filter.type": TYPE_URN[type],
    "signal.interests.entities": [ctx.entityId, ...anchors.map((a) => a.id)],
    ...locationSignal(ctx.center.lat, ctx.center.lng),
    "feature.explainability": "true",
    ...(exclude.length ? { "filter.exclude.entities": exclude.map((e) => e.id) } : {}),
    take: String(PICKS_PER_TYPE),
  };
  const got = await run.call(`insights_${type}`, "/v2/insights", params, capFirst(`${TYPE_SINGULAR[type]} picks`));
  if (!got) return null;
  const entities = rankBy(parseEntities(got.body), (e) => e.affinity);
  const warnings = parseWarnings(got.body);
  const venueDropped = warnings.notFound.some((id) => sameId(id, ctx.entityId));
  return {
    type,
    ref: got.ref,
    entities,
    tied: !venueDropped && entities.some((e) => tiedToVenue(e, ctx)),
    summary: explainSummary(got.body, "effect_on_top10_recs"),
    ignored: warnings.notFound.filter((id) => !sameId(id, ctx.entityId)),
  };
}

// A book's disambiguation reads "2008, Matt Haig": the year, then the author.
export function authorOf(disambiguation: string | undefined): string | null {
  const m = /^\s*\d{3,4}\s*,\s*(.+?)\s*$/.exec(disambiguation ?? "");
  return m?.[1] ?? null;
}

type Names = Map<string, string>;

function nameOf(names: Names, id: string): string {
  return names.get(id.toUpperCase()) ?? "an input";
}

function shares(rows: ExplainRow[], names: Names): string {
  return listWords(rows.map((r) => `${nameOf(names, r.entityId)} ${share(r.score)}`));
}

function listLine(list: PickList, ctx: ReadContext, anchors: LovedPlace[], names: Names): string {
  const of = plural(list.entities.length, TYPE_SINGULAR[list.type], TYPE_PLURAL[list.type]);
  if (!list.tied) return `One of ${of} Qloo returned for the area around ${ctx.name}`;
  const used = anchors.filter((a) => !list.ignored.some((id) => sameId(id, a.id)));
  const who = `people who like ${listWords([ctx.name, ...used.map((a) => plainName(a.name))])}`;
  const top = anchors.length && list.summary.length > 1 ? `. Across the top 10, Qloo's explainability share is ${shares(list.summary, names)}` : "";
  return `Ranked among ${of} for ${who}, read with the streets around it${top}`;
}

function toRising(e: QEntity, rank: number, list: PickList, line: string, names: Names, ctx: ReadContext): Rising {
  const explained = e.explain.length > 1;
  // On a joint read a lone share still says whose pick it is when Qloo could not read the other place.
  const whose = explained || (e.explain.length === 1 && names.size > 1);
  const r: Rising = {
    id: e.id,
    name: e.name,
    type: list.type,
    rank,
    trend: "unknown",
    because: [{ kind: tiedToVenue(e, ctx) ? "explainability" : "affinity", text: line, provenance: list.ref }],
    tags: e.tags.map((t) => t.id),
    venueSignal: list.tied,
  };
  if (e.channel && list.type === "podcast" && e.channel.trim().toLowerCase() !== e.name.trim().toLowerCase()) r.by = e.channel.trim();
  const author = list.type === "book" ? authorOf(e.disambiguation) : null;
  if (author) r.by = author;
  // Every result shares the list line, so a screen can say it once; this line is the pick's own receipt.
  if (whose) r.explain = e.explain.map((x) => ({ entityId: x.entityId, share: x.score }));
  if (explained) r.because.push({ kind: "explainability", text: `How much of this one comes from each place: ${shares(e.explain, names)}`, provenance: list.ref });
  if (e.image) r.image = e.image;
  if (e.url) r.url = e.url;
  if (e.popularity !== null) r.popularity = e.popularity;
  if (e.minutes && list.type === "movie") r.minutes = e.minutes;
  return r;
}

function crossLimits(lists: PickList[], ctx: ReadContext, names: Names): string[] {
  const empty = lists.filter((l) => !l.entities.length).map((l) => TYPE_PLURAL[l.type]);
  const areaOnly = lists.filter((l) => l.entities.length && !l.tied).map((l) => TYPE_PLURAL[l.type]);
  const limits: string[] = [];
  if (empty.length) limits.push(`No ${listWords(empty)} came back for ${ctx.name}.`);
  if (areaOnly.length) limits.push(`The ${listWords(areaOnly)} came back without ${ctx.name} itself in the read, so those picks reflect the area only and are not ranked.`);
  const ignored = new Map<string, string[]>();
  for (const l of lists) for (const id of l.ignored) ignored.set(nameOf(names, id), [...(ignored.get(nameOf(names, id)) ?? []), TYPE_PLURAL[l.type]]);
  for (const [name, types] of ignored) limits.push(`There is no read of ${name} for the ${listWords(types)}, so those lists lean on the others.`);
  return limits;
}

export async function crossDomain(run: Runner, ctx: ReadContext, input: CrossInput): Promise<{ rising: Rising[]; anchors: LovedPlace[]; limits: string[] }> {
  const anchors = input.anchors;
  const names: Names = new Map([[ctx.entityId.toUpperCase(), ctx.name], ...anchors.map((a): [string, string] => [a.id.toUpperCase(), plainName(a.name)])]);
  const lists = (await Promise.all((input.types ?? CROSS_TYPES).map((t) => pickList(run, ctx, t, anchors, input.exclude)))).filter((l): l is PickList => l !== null);
  const rising = lists.flatMap((l) => {
    const line = listLine(l, ctx, anchors, names);
    return l.entities.map((e, i) => toRising(e, i + 1, l, line, names, ctx));
  });
  const limits = crossLimits(lists, ctx, names);
  if (input.exclude.length) limits.push(`Left out because you ran them: ${listWords(input.exclude.map((e) => e.name))}.`);
  return { rising, anchors, limits };
}
