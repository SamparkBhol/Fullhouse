import type {
  Because,
  Demographics,
  Gap,
  HeatCell,
  HeatLayer,
  LovedPlace,
  Provenance,
  QlooType,
  Rising,
  StreetRead,
  StreetTag,
  Venue,
} from "../../shared/contract.ts";
import { QlooError, type Qloo, type QlooResult } from "../qloo/client.ts";
import {
  explainWarning,
  parseDemographics,
  parseEntities,
  parseHeatmap,
  parseTags,
  parseTrending,
  tagLabel,
  type ExplainRow,
  type QEntity,
  type QTag,
} from "../qloo/parse.ts";
import {
  TYPE_URN,
  TYPE_URN_ALTERNATES,
  locationFilter,
  locationSignal,
  trendWindow,
  type Params,
} from "../qloo/request.ts";
import { haversineM } from "./geo.ts";
import { limiter } from "./limit.ts";
import { classifyTrend } from "./trend.ts";

export const READ_CAP = 30;
export const CONCURRENCY = 4;
export const LOVED_RADIUS_M = 1200;
export const HEAT_RADIUS_M = 2000;
export const MAX_TRENDING = 12;
export const MAX_HEAT_CELLS = 400;
export const CROSS_TYPES: QlooType[] = ["artist", "book", "movie", "tv_show", "podcast", "videogame"];
export const STREET_TAG_TYPES = [
  "urn:tag:genre:media",
  "urn:tag:genre:music",
  "urn:tag:keyword:media",
  "urn:tag:ambience:qloo",
  "urn:tag:cuisine:qloo",
  "urn:tag:genre:place",
  "urn:tag:good_for:qloo",
  "urn:tag:menu_highlight:qloo",
  "urn:tag:specialty_dish:place",
  "urn:tag:dining_options:place",
];

export const TYPE_PLURAL: Record<QlooType, string> = {
  artist: "artists",
  book: "books",
  movie: "films",
  tv_show: "TV shows",
  podcast: "podcasts",
  videogame: "video games",
  place: "places",
  brand: "brands",
  person: "people",
  destination: "destinations",
};

const TYPE_LABEL: Record<QlooType, string> = {
  artist: "Artist picks",
  book: "Book picks",
  movie: "Film picks",
  tv_show: "TV show picks",
  podcast: "Podcast picks",
  videogame: "Video game picks",
  place: "Place picks",
  brand: "Brand picks",
  person: "People picks",
  destination: "Destination picks",
};

export const RANK_LIMIT = "Ranks are positions within one Qloo response. They are not scores and cannot be compared across lists.";
export const AGGREGATE_LIMIT = "Everything here is Qloo's aggregate taste data for the area around the venue, not a fact about any person.";

const KIND_TEXT: Record<QlooError["kind"], string> = {
  auth: "Qloo refused the key",
  rate: "Qloo rate limit",
  bad_request: "Qloo rejected the request",
  not_found: "nothing found",
  server: "Qloo server error",
  budget: "daily budget spent",
  network: "network error",
  timeout: "timed out",
};

type Attempt = { res: QlooResult } | { err: QlooError } | { skipped: true };

class Runner {
  count = 0;
  stopped = false;
  private seq = 0;
  private notes: Array<{ seq: number; text: string }> = [];
  private run = limiter(CONCURRENCY);

  constructor(
    private q: Qloo,
    private cap: number,
  ) {}

  note(text: string, seq = this.seq++): void {
    this.notes.push({ seq, text });
  }

  limits(): string[] {
    return this.notes.sort((a, b) => a.seq - b.seq).map((n) => n.text);
  }

  async attempt(call: string, path: string, params: Params, label: string): Promise<Attempt> {
    const seq = this.seq++;
    if (this.stopped) return { skipped: true };
    if (this.count >= this.cap) {
      this.note(`${label} was skipped because this read reached its cap of ${this.cap} Qloo calls.`, seq);
      return { skipped: true };
    }
    this.count++;
    try {
      return { res: await this.run(() => this.q.get(call, path, params)) };
    } catch (err) {
      if (!(err instanceof QlooError)) throw err;
      if (err.kind === "auth") throw err;
      if (err.kind === "budget") {
        if (!this.stopped) this.note("The daily Qloo call budget ran out during this read, so the remaining calls were skipped.", seq);
        this.stopped = true;
        return { skipped: true };
      }
      return { err: Object.assign(err, { seq }) };
    }
  }

  fail(label: string, err: QlooError & { seq?: number }): void {
    const text = err.kind === "not_found" ? `${label} came back empty.` : `${label} failed (${KIND_TEXT[err.kind]}), so that part of the read is missing.`;
    this.note(text, err.seq);
  }

  async call(call: string, path: string, params: Params, label: string, required = false): Promise<QlooResult | null> {
    const a = await this.attempt(call, path, params, label);
    if ("res" in a) return a.res;
    if ("err" in a) {
      if (required) throw a.err;
      this.fail(label, a.err);
    }
    if (required) throw new QlooError("budget", 0, `${label} could not run`, call);
    return null;
  }
}

class ProvLog {
  rows: Provenance[] = [];
  add(res: QlooResult | null | undefined): number {
    if (!res) return -1;
    this.rows.push(res.prov);
    return this.rows.length - 1;
  }
}

function rankBy<T>(items: T[], score: (t: T) => number | null): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(item) }))
    .sort((a, b) => {
      if (a.s !== null && b.s !== null && a.s !== b.s) return b.s - a.s;
      if (a.s !== null && b.s === null) return -1;
      if (a.s === null && b.s !== null) return 1;
      return a.i - b.i;
    })
    .map((x) => x.item);
}

function toStreetTags(tags: QTag[]): StreetTag[] {
  return rankBy(tags, (t) => t.score).map((t, i) => ({ id: t.id, name: t.name, namespace: t.namespace, rank: i + 1 }));
}

function same(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}

function explainBecause(rows: ExplainRow[], names: Map<string, string>, around: string, prov: number): Because[] {
  const out: Because[] = [];
  for (const r of rows.slice(0, 2)) {
    let who = names.get(r.input.toUpperCase());
    if (!who && /location/i.test(`${r.input} ${r.source}`)) who = around;
    if (!who) continue;
    out.push({
      kind: "explainability",
      text: `Qloo explainability credits this pick ${r.score >= 0.5 ? "mainly" : "partly"} to ${who}`,
      provenance: prov,
    });
  }
  return out;
}

function streetTagBecause(entityTags: QTag[] | string[], street: StreetTag[], prov: number): Because[] {
  if (prov < 0) return [];
  const ids = new Set(entityTags.map((t) => (typeof t === "string" ? t : t.id)));
  const hit = street.find((s) => ids.has(s.id));
  if (!hit) return [];
  return [{ kind: "tag", text: `Tagged ${hit.name}, which ranks #${hit.rank} in the street's taste profile`, provenance: prov }];
}

function cleanCells(cells: ReturnType<typeof parseHeatmap>): { cells: HeatCell[]; noRead: number } {
  const good: HeatCell[] = [];
  let noRead = 0;
  for (const c of cells) {
    if (c.affinityRank === null || c.popularity === null) {
      noRead++;
      continue;
    }
    good.push({ geohash: c.geohash, lat: c.lat, lng: c.lng, affinityRank: c.affinityRank, popularity: c.popularity });
  }
  good.sort((a, b) => b.affinityRank - a.affinityRank || a.geohash.localeCompare(b.geohash));
  return { cells: good.slice(0, MAX_HEAT_CELLS), noRead };
}

const AGE_LABEL: Record<string, string> = {
  "24_and_younger": "24 and younger",
  "25_to_29": "25 to 29",
  "30_to_34": "30 to 34",
  "35_to_44": "35 to 44",
  "45_to_54": "45 to 54",
  "55_and_older": "55 and older",
};

export function summariseDemographics(blocks: ReturnType<typeof parseDemographics>): string | null {
  if (!blocks.length) return null;
  const age: Record<string, number> = {};
  const gender: Record<string, number> = {};
  for (const b of blocks) {
    for (const [k, v] of Object.entries(b.age)) age[k] = (age[k] ?? 0) + v / blocks.length;
    for (const [k, v] of Object.entries(b.gender)) gender[k] = (gender[k] ?? 0) + v / blocks.length;
  }
  const lean = Object.entries(age)
    .filter(([, v]) => v >= 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => AGE_LABEL[k] ?? k.replace(/_/g, " "));
  const male = gender.male ?? (gender.female !== undefined ? -gender.female : 0);
  const genderText = Math.abs(male) >= 0.05 ? `, leaning ${male > 0 ? "male" : "female"}` : "";
  const ageText = lean.length ? `the ${lean.join(" and ")} age groups` : "no single age group";
  return `The audience for this street's top tastes over indexes on ${ageText}${genderText}. This is Qloo's aggregate signal for those tastes here, not a description of any person.`;
}

function fmtTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function cacheLine(prov: Provenance[], prefix: string): string | null {
  const cached = prov.filter((p) => p.cached);
  if (!cached.length) return null;
  const times = cached.map((p) => p.at).sort();
  const first = times[0] ?? "";
  const last = times[times.length - 1] ?? "";
  const when = first.slice(0, 16) === last.slice(0, 16) ? `fetched ${fmtTime(first)}` : `fetched between ${fmtTime(first)} and ${fmtTime(last)}`;
  return `${prefix}${cached.length} of ${prov.length} Qloo calls came from the cache, ${when}.`;
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

interface TrendTarget {
  type: QlooType;
  urn: string;
  id: string;
  name: string;
}

export function pickTrendTargets(groups: Array<{ type: QlooType; urn: string; items: Array<{ id: string; name: string }> }>, max = MAX_TRENDING): TrendTarget[] {
  const out: TrendTarget[] = [];
  for (let i = 0; out.length < max; i++) {
    let any = false;
    for (const g of groups) {
      const item = g.items[i];
      if (!item) continue;
      any = true;
      if (out.length < max) out.push({ type: g.type, urn: g.urn, id: item.id, name: item.name });
    }
    if (!any) break;
  }
  return out;
}

async function runTrending(runner: Runner, targets: TrendTarget[], now: Date) {
  const win = trendWindow(now);
  return Promise.all(
    targets.map((t) =>
      runner.call(
        "trending",
        "/v2/trending",
        {
          "filter.type": t.urn,
          "signal.interests.entities": t.id,
          "filter.start_date": win.start,
          "filter.end_date": win.end,
          take: "10",
        },
        `Momentum check for ${t.name}`,
      ),
    ),
  );
}

function trendingBecause(res: QlooResult | null, idx: number, t: TrendTarget): { trend: Rising["trend"]; trendNote?: string; because: Because[] } {
  if (!res || idx < 0) return { trend: "unknown", because: [] };
  const read = classifyTrend(parseTrending(res.body, t.id), t.id, TYPE_PLURAL[t.type]);
  const out: { trend: Rising["trend"]; trendNote?: string; because: Because[] } = { trend: read.trend, because: [] };
  if (read.note) {
    out.trendNote = read.note;
    out.because.push({ kind: "trending", text: read.note, provenance: idx });
  }
  return out;
}

export async function readStreet(
  q: Qloo,
  venue: Venue,
  opts?: { previous?: StreetRead; momentumOnly?: boolean },
): Promise<StreetRead> {
  const now = q.now?.() ?? new Date();
  if (opts?.momentumOnly && opts.previous && opts.previous.venueId === venue.id) {
    return refreshMomentum(q, venue, opts.previous, now);
  }
  const runner = new Runner(q, READ_CAP);
  const log = new ProvLog();
  const center = { lat: venue.entity.lat, lng: venue.entity.lng };
  const name = venue.entity.name;
  const around = `the taste of people around ${name}`;
  const names = new Map<string, string>([[venue.entity.id.toUpperCase(), name]]);
  const sig = locationSignal(center.lat, center.lng);

  const venueRes = await runner.call("venue", "/entities", { entity_ids: venue.entity.id }, "Venue lookup", true);
  const venueEnt = parseEntities(venueRes?.body).find((e) => same(e.id, venue.entity.id));
  if (!venueRes || !venueEnt) {
    throw new QlooError("not_found", 404, `Qloo did not return ${name} for its id`, "venue");
  }

  const tagParams = { "filter.type": "urn:tag", "filter.tag.types": STREET_TAG_TYPES, "diversify.by": "subtype", "diversify.take": "5", take: "50" };
  const typeUrnUsed = new Map<QlooType, string>();
  const typeCall = async (t: QlooType): Promise<QlooResult | null> => {
    const label = TYPE_LABEL[t];
    const urns = [TYPE_URN[t], ...(TYPE_URN_ALTERNATES[t] ?? [])];
    for (let i = 0; i < urns.length; i++) {
      const urn = urns[i] ?? TYPE_URN[t];
      const a = await runner.attempt(
        `insights_${t}`,
        "/v2/insights",
        { "filter.type": urn, ...sig, "bias.trends": "high", "feature.explainability": "true", take: "10" },
        label,
      );
      if ("res" in a) {
        typeUrnUsed.set(t, urn);
        return a.res;
      }
      if ("skipped" in a) return null;
      if (a.err.kind === "bad_request" && i < urns.length - 1) continue;
      runner.fail(label, a.err);
      return null;
    }
    return null;
  };

  const [streetRes0, venueTagRes, lovedRes, heatVenueRes, ...typeRes] = await Promise.all([
    runner.call("street_tags", "/v2/insights", { ...tagParams, ...sig }, "Street taste tags"),
    runner.call("venue_tags", "/v2/insights", { ...tagParams, "signal.interests.entities": venue.entity.id }, "Venue audience tags"),
    runner.call(
      "loved_places",
      "/v2/insights",
      {
        "filter.type": TYPE_URN.place,
        ...locationFilter(center.lat, center.lng, LOVED_RADIUS_M),
        ...sig,
        "filter.exclude.entities": venue.entity.id,
        "feature.explainability": "true",
        take: "30",
      },
      "Nearby places",
    ),
    runner.call(
      "heat_venue",
      "/v2/insights",
      { "filter.type": "urn:heatmap", ...locationFilter(center.lat, center.lng, HEAT_RADIUS_M), "signal.interests.entities": venue.entity.id },
      "Venue heatmap",
    ),
    ...CROSS_TYPES.map((t) => typeCall(t)),
  ]);

  const streetRes = streetRes0;
  let streetQTags = streetRes ? parseTags(streetRes.body) : [];
  let streetRetry: QlooResult | null = null;
  if (streetRes && !streetQTags.length) {
    streetRetry = await runner.call("street_tags_open", "/v2/insights", { "filter.type": "urn:tag", ...sig, take: "50" }, "Street taste tags without namespace filters");
    if (streetRetry) {
      const retryTags = parseTags(streetRetry.body);
      if (retryTags.length) {
        runner.note("The street tag read with namespace filters came back empty, so it was rerun without them.");
        streetQTags = retryTags;
      }
    }
  }
  const streetTagsRanked = toStreetTags(streetQTags);
  const venueQTags = venueTagRes ? parseTags(venueTagRes.body) : [];
  const venueTagsRanked = toStreetTags(venueQTags);
  const topTagIds = streetTagsRanked.slice(0, 3).map((t) => t.id);

  const lovedAll = lovedRes ? parseEntities(lovedRes.body).filter((e) => !same(e.id, venue.entity.id)) : [];
  const lovedRanked = rankBy(lovedAll, (e) => e.affinity);
  const withCoords = lovedRanked.filter((e) => e.lat !== null && e.lng !== null);
  const noCoords = lovedRanked.length - withCoords.length;
  const nearby = withCoords.filter((e) => haversineM(center, { lat: e.lat as number, lng: e.lng as number }) <= LOVED_RADIUS_M + 300);
  const tooFar = withCoords.length - nearby.length;
  const top3 = nearby.slice(0, 3);

  const [heatStreetRes, compareRes, demoRes] = await Promise.all([
    topTagIds.length
      ? runner.call(
          "heat_street",
          "/v2/insights",
          {
            "filter.type": "urn:heatmap",
            ...locationFilter(center.lat, center.lng, HEAT_RADIUS_M),
            "signal.interests.tags": topTagIds,
            "operator.signal.interests.tags": "union",
          },
          "Street heatmap",
        )
      : Promise.resolve(null),
    top3.length
      ? runner.call(
          "compare",
          "/v2/analysis/compare",
          { "a.signal.interests.entities": venue.entity.id, "b.signal.interests.entities": top3.map((e) => e.id), take: "20" },
          "Venue versus street comparison",
        )
      : Promise.resolve(null),
    topTagIds.length
      ? runner.call("demographics", "/v2/insights", { "filter.type": "urn:demographics", ...sig, "signal.interests.tags": topTagIds }, "Street demographics")
      : Promise.resolve(null),
  ]);

  const typeGroups = CROSS_TYPES.map((t, i) => {
    const res = typeRes[i] ?? null;
    const entities = res ? rankBy(parseEntities(res.body), (e) => e.affinity) : [];
    return { type: t, urn: typeUrnUsed.get(t) ?? TYPE_URN[t], res, entities };
  });
  const targets = pickTrendTargets(typeGroups.map((g) => ({ type: g.type, urn: g.urn, items: g.entities })));
  const trendRes = await runTrending(runner, targets, now);

  const iVenue = log.add(venueRes);
  const iStreet = log.add(streetRes);
  const iStreetRetry = log.add(streetRetry);
  const iStreetTags = streetRetry && parseTags(streetRetry.body).length ? iStreetRetry : streetQTags.length ? iStreet : -1;
  const iVenueTags = log.add(venueTagRes);
  const iLoved = log.add(lovedRes);
  const iHeatVenue = log.add(heatVenueRes);
  const iTypes = typeGroups.map((g) => log.add(g.res));
  const iHeatStreet = log.add(heatStreetRes);
  const iCompare = log.add(compareRes);
  const iDemo = log.add(demoRes);
  const iTrend = trendRes.map((r) => log.add(r));

  const limits: string[] = [];
  const allNullAffinity = lovedAll.length > 0 && lovedAll.every((e) => e.affinity === null);

  const lovedPlaces: LovedPlace[] = nearby.map((e, i) => {
    const lat = e.lat as number;
    const lng = e.lng as number;
    const rank = i + 1;
    const because: Because[] = [
      {
        kind: "affinity",
        text: allNullAffinity
          ? `Listed #${rank} of ${nearby.length} places within 1.2 km, ordered by popularity because no taste signal applied`
          : `Ranked #${rank} of ${nearby.length} places within 1.2 km for ${around}`,
        provenance: iLoved,
      },
      ...explainBecause(e.explain, names, around, iLoved),
      ...streetTagBecause(e.tags, streetTagsRanked, iStreetTags),
    ];
    const p: LovedPlace = {
      id: e.id,
      name: e.name,
      type: "place",
      lat,
      lng,
      distanceM: Math.round(haversineM(center, { lat, lng })),
      rank,
      tags: e.tags.map((t) => t.id),
      because,
    };
    if (e.subtype) p.subtype = e.subtype;
    if (e.address) p.address = e.address;
    if (e.image) p.image = e.image;
    if (e.url) p.url = e.url;
    return p;
  });

  const trendByEntity = new Map<string, { res: QlooResult | null; idx: number; target: TrendTarget }>();
  targets.forEach((t, i) => trendByEntity.set(t.id.toUpperCase(), { res: trendRes[i] ?? null, idx: iTrend[i] ?? -1, target: t }));

  const rising: Rising[] = [];
  typeGroups.forEach((g, gi) => {
    const prov = iTypes[gi] ?? -1;
    const nullAff = g.entities.length > 0 && g.entities.every((e) => e.affinity === null);
    g.entities.forEach((e, i) => {
      const rank = i + 1;
      const tr = trendByEntity.get(e.id.toUpperCase());
      const trend = tr ? trendingBecause(tr.res, tr.idx, tr.target) : { trend: "unknown" as const, because: [] };
      const r: Rising = {
        id: e.id,
        name: e.name,
        type: g.type,
        rank,
        trend: trend.trend,
        because: [
          {
            kind: "affinity",
            text: nullAff
              ? `Listed #${rank} of ${g.entities.length} ${TYPE_PLURAL[g.type]}, ordered by popularity because no taste signal applied`
              : `Ranked #${rank} of ${g.entities.length} ${TYPE_PLURAL[g.type]} for ${around}, with trends weighted high`,
            provenance: prov,
          },
          ...trend.because,
          ...explainBecause(e.explain, names, around, prov),
          ...streetTagBecause(e.tags, streetTagsRanked, iStreetTags),
        ],
        tags: e.tags.map((t) => t.id),
      };
      if ("trendNote" in trend && trend.trendNote) r.trendNote = trend.trendNote;
      if (e.subtype) r.subtype = e.subtype;
      if (e.image) r.image = e.image;
      if (e.url) r.url = e.url;
      rising.push(r);
    });
    const warn = g.res ? explainWarning(g.res.body) : null;
    if (warn) limits.push(`Qloo did not return explainability for the ${TYPE_PLURAL[g.type]}: ${warn}`);
  });

  const heat: HeatLayer[] = [];
  let noRead = 0;
  if (heatStreetRes) {
    const { cells, noRead: n } = cleanCells(parseHeatmap(heatStreetRes.body));
    noRead += n;
    const labels = streetTagsRanked.slice(0, 3).map((t) => t.name);
    if (cells.length) heat.push({ label: `Taste for ${listWords(labels)} around ${name}`, cells, provenance: iHeatStreet });
    else limits.push(`The heatmap for ${listWords(labels)} came back with no cells around the venue.`);
  }
  if (heatVenueRes) {
    const { cells, noRead: n } = cleanCells(parseHeatmap(heatVenueRes.body));
    noRead += n;
    if (cells.length) heat.push({ label: `Where ${name}'s audience over indexes`, cells, provenance: iHeatVenue });
    else limits.push(`The heatmap for ${name}'s audience came back with no cells around the venue.`);
  }
  if (noRead) limits.push(noRead === 1 ? "1 heatmap cell came back with no read and is not drawn." : `${noRead} heatmap cells came back with no read and are not drawn.`);

  let shared: StreetTag[] = [];
  if (compareRes) {
    const compareTags = parseTags(compareRes.body);
    if (compareTags.length) shared = toStreetTags(compareTags).slice(0, 10);
    else limits.push("The venue versus street comparison returned no shared tags.");
  }
  if (!compareRes && streetTagsRanked.length && venueTagsRanked.length) {
    const venueIds = new Set(venueTagsRanked.map((t) => t.id));
    shared = streetTagsRanked.filter((t) => venueIds.has(t.id)).slice(0, 10).map((t, i) => ({ ...t, rank: i + 1 }));
    if (shared.length) limits.push("Shared tags come from the two tag reads because the comparison call did not run.");
  }

  const gaps: Gap[] = [];
  const venueOwn = new Set([...venueEnt.tags.map((t) => t.id), ...venue.entity.tags]);
  if (venueTagRes && !venueTagsRanked.length) {
    limits.push(`Qloo returned no audience tags for ${name}, so gaps come only from the places nearby.`);
  }
  if (venueTagRes && venueTagsRanked.length && iStreetTags >= 0) {
    const venueAudience = new Set(venueTagsRanked.map((t) => t.id));
    for (const t of streetTagsRanked) {
      if (gaps.length >= 5) break;
      if (venueAudience.has(t.id) || venueOwn.has(t.id)) continue;
      gaps.push({
        tag: t,
        note: `The street ranks ${t.name} #${t.rank}; ${name}'s audience does not show it yet`,
        because: [
          { kind: "tag", text: `${t.name} ranks #${t.rank} in the street's taste profile`, provenance: iStreetTags },
          { kind: "tag", text: `${t.name} is not among the tags Qloo returns for ${name}'s audience`, provenance: iVenueTags },
        ],
      });
    }
  } else if (!venueTagRes && streetTagsRanked.length) {
    limits.push(`Gaps from the street's taste tags are missing because the read of ${name}'s audience did not come back.`);
  }
  if (top3.length && iLoved >= 0) {
    const venueAudience = new Set(venueTagsRanked.map((t) => t.id));
    const counts = new Map<string, { tag: QTag; places: string[]; best: number }>();
    top3.forEach((e, rank) => {
      for (const t of e.tags) {
        if (venueOwn.has(t.id) || venueAudience.has(t.id)) continue;
        const c = counts.get(t.id) ?? { tag: t, places: [], best: rank };
        c.places.push(e.name);
        counts.set(t.id, c);
      }
    });
    const placeGaps = [...counts.values()]
      .filter((c) => !gaps.some((g) => g.tag.id === c.tag.id))
      .sort((a, b) => b.places.length - a.places.length || a.best - b.best || a.tag.id.localeCompare(b.tag.id))
      .slice(0, 8 - gaps.length);
    placeGaps.forEach((c, i) => {
      gaps.push({
        tag: { id: c.tag.id, name: c.tag.name, namespace: c.tag.namespace, rank: i + 1 },
        note: `${c.places.length} of the ${top3.length} places the street loves most ${c.places.length === 1 ? "is" : "are"} tagged ${c.tag.name}; ${name} is not`,
        because: [
          { kind: "tag", text: `Tagged ${c.tag.name}: ${listWords(c.places)}`, provenance: iLoved },
          { kind: "tag", text: `${name}'s own Qloo tags do not include ${c.tag.name}`, provenance: iVenue },
        ],
      });
    });
  }

  let demographics: Demographics | undefined;
  if (demoRes) {
    const summary = summariseDemographics(parseDemographics(demoRes.body));
    if (summary) demographics = { summary, provenance: iDemo };
    else limits.push("Qloo returned no demographic signal for this street.");
  }

  if (!streetTagsRanked.length) limits.push("Qloo returned no taste tags for this location.");
  if (lovedRes) {
    if (!nearby.length) limits.push("Qloo returned no places within 1.2 km of the venue.");
    else if (nearby.length < 3) limits.push(`Only ${nearby.length} places within 1.2 km came back from Qloo, so this read is thin.`);
    if (allNullAffinity) limits.push("Qloo ordered the nearby places by popularity because no taste signal applied to them.");
  }
  if (noCoords) limits.push(noCoords === 1 ? "1 place came back without coordinates and is not on the map." : `${noCoords} places came back without coordinates and are not on the map.`);
  if (tooFar) limits.push(tooFar === 1 ? "1 place further than 1.2 km was left out." : `${tooFar} places further than 1.2 km were left out.`);
  const emptyTypes = typeGroups.filter((g) => g.res && !g.entities.length).map((g) => TYPE_PLURAL[g.type]);
  if (emptyTypes.length) limits.push(`Qloo returned no ${listWords(emptyTypes)} for this location.`);
  if (!targets.length) limits.push("Momentum was not checked because no cross domain picks came back.");
  limits.push(RANK_LIMIT, AGGREGATE_LIMIT);
  const cache = cacheLine(log.rows, "");
  if (cache) limits.push(cache);

  return {
    venueId: venue.id,
    at: now.toISOString(),
    center,
    radiusM: LOVED_RADIUS_M,
    heat,
    streetTags: streetTagsRanked,
    venueTags: venueTagsRanked,
    shared,
    gaps,
    lovedPlaces,
    rising,
    ...(demographics ? { demographics } : {}),
    limits: [...runner.limits(), ...limits],
    provenance: log.rows,
  };
}

function remapBecause(list: Because[], map: Map<number, number>): Because[] {
  return list.flatMap((b) => {
    const idx = map.get(b.provenance);
    return idx === undefined ? [] : [{ ...b, provenance: idx }];
  });
}

async function refreshMomentum(q: Qloo, venue: Venue, prev: StreetRead, now: Date): Promise<StreetRead> {
  const map = new Map<number, number>();
  const kept: Provenance[] = [];
  prev.provenance.forEach((p, i) => {
    if (p.endpoint === "/v2/trending") return;
    map.set(i, kept.length);
    kept.push(p);
  });

  const runner = new Runner(q, READ_CAP);
  const byType = new Map<QlooType, Array<{ id: string; name: string; rank: number }>>();
  for (const r of prev.rising) {
    const list = byType.get(r.type) ?? [];
    list.push({ id: r.id, name: r.name, rank: r.rank });
    byType.set(r.type, list);
  }
  const groups = CROSS_TYPES.filter((t) => byType.has(t)).map((t) => ({
    type: t,
    urn: TYPE_URN[t],
    items: (byType.get(t) ?? []).sort((a, b) => a.rank - b.rank),
  }));
  const targets = pickTrendTargets(groups);
  const results = await runTrending(runner, targets, now);
  const fresh: Provenance[] = [];
  const idxs = results.map((r) => {
    if (!r) return -1;
    fresh.push(r.prov);
    return kept.length + fresh.length - 1;
  });
  const trendBy = new Map<string, ReturnType<typeof trendingBecause>>();
  targets.forEach((t, i) => trendBy.set(t.id.toUpperCase(), trendingBecause(results[i] ?? null, idxs[i] ?? -1, t)));

  const rising: Rising[] = prev.rising.map((r) => {
    const base = remapBecause(r.because.filter((b) => b.kind !== "trending"), map);
    const tr = trendBy.get(r.id.toUpperCase());
    const next: Rising = { ...r, trend: tr ? tr.trend : "unknown", because: tr ? [base[0], ...tr.because, ...base.slice(1)].filter((b): b is Because => !!b) : base };
    delete next.trendNote;
    if (tr?.trendNote) next.trendNote = tr.trendNote;
    return next;
  });

  const limits = prev.limits.filter((l) => !l.startsWith("Momentum") && !/came from the cache/.test(l));
  const cache = cacheLine(kept, "");
  if (cache) limits.push(cache);
  limits.push(...runner.limits().map((l) => (l.startsWith("Momentum") ? l : `Momentum: ${l}`)));
  const freshCache = cacheLine(fresh, "Momentum: ");
  if (freshCache) limits.push(freshCache);
  limits.push(`Momentum refreshed ${fmtTime(now.toISOString())}; the rest of this read dates from ${fmtTime(prev.at)}.`);

  const out: StreetRead = {
    ...prev,
    venueId: venue.id,
    at: now.toISOString(),
    heat: prev.heat.flatMap((h) => {
      const p = map.get(h.provenance);
      return p === undefined ? [] : [{ ...h, provenance: p }];
    }),
    gaps: prev.gaps.map((g) => ({ ...g, because: remapBecause(g.because, map) })),
    lovedPlaces: prev.lovedPlaces.map((p) => ({ ...p, because: remapBecause(p.because, map) })),
    rising,
    limits,
    provenance: [...kept, ...fresh],
  };
  const demoIdx = prev.demographics ? map.get(prev.demographics.provenance) : undefined;
  if (prev.demographics && demoIdx !== undefined) out.demographics = { ...prev.demographics, provenance: demoIdx };
  else delete out.demographics;
  return out;
}
