import type { QlooType } from "../../shared/contract.ts";
import { parseExplain, type ExplainRow } from "./explain.ts";
import { resultRows } from "./results.ts";
import { parseTagList, type QTag } from "./tags.ts";
import { typeFromUrn } from "./urns.ts";
import { isObj, list, num, obj, str } from "./values.ts";

export interface QEntity {
  id: string;
  name: string;
  type: QlooType | null;
  typeName?: string;
  popularity: number | null;
  affinity: number | null;
  distanceM: number | null;
  lat: number | null;
  lng: number | null;
  address?: string;
  disambiguation?: string;
  image?: string;
  url?: string;
  areaNames: string[];
  tags: QTag[];
  explain: ExplainRow[];
  closed: boolean;
  hours?: WeekHours;
  channel?: string;
  neighborhood?: string;
  // A film's running time in minutes.
  minutes?: number;
}

export interface OpenSpan {
  opens?: string;
  closes?: string;
  closed?: boolean;
}

export type WeekHours = Record<string, OpenSpan[]>;

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Qloo writes times as "T10:00:00"; only HH:MM is kept.
function clock(v: unknown): string | undefined {
  const m = /T?(\d{2}):(\d{2})/.exec(str(v) ?? "");
  return m ? `${m[1]}:${m[2]}` : undefined;
}

function parseHours(raw: unknown): WeekHours | undefined {
  const days = obj(raw);
  const out: WeekHours = {};
  for (const day of WEEKDAY_KEYS) {
    const spans = list(days[day]).map((s): OpenSpan => {
      const span: OpenSpan = {};
      const o = obj(s);
      if (o.closed === true) span.closed = true;
      const opens = clock(o.opens);
      const closes = clock(o.closes);
      if (opens) span.opens = opens;
      if (closes) span.closes = closes;
      return span;
    });
    if (spans.length) out[day] = spans;
  }
  return Object.keys(out).length ? out : undefined;
}

// Insights names the type in subtype; /search and /entities list it in types[].
function entityType(raw: Record<string, unknown>): QlooType | null {
  for (const urn of [raw.subtype, ...list(raw.types)]) {
    const t = typeFromUrn(urn);
    if (t) return t;
  }
  return null;
}

// The last part of the entity urn, such as "author", which typeFromUrn folds into person.
function typeName(raw: Record<string, unknown>): string | undefined {
  const urn = [raw.subtype, ...list(raw.types)].map(str).find((u) => u?.startsWith("urn:entity:"));
  return urn ? urn.slice("urn:entity:".length).replace(/_/g, " ") : undefined;
}

function coords(raw: Record<string, unknown>): { lat: number | null; lng: number | null } {
  const loc = obj(raw.location);
  const lat = num(loc.lat);
  const lng = num(loc.lon);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { lat: null, lng: null };
  return { lat, lng };
}

function areaNames(props: Record<string, unknown>): string[] {
  const g = obj(props.geocode);
  const names = [g.name, g.city, g.admin2_region, g.admin1_region, g.metro, g.country, props.neighborhood].map(str);
  return [...new Set(names.filter((n): n is string => n !== undefined))];
}

export function parseEntity(raw: unknown): QEntity | null {
  if (!isObj(raw)) return null;
  const id = str(raw.entity_id);
  const name = str(raw.name);
  if (!id || !name) return null;
  const props = obj(raw.properties);
  const q = obj(raw.query);
  const e: QEntity = {
    id,
    name,
    type: entityType(raw),
    popularity: num(raw.popularity),
    affinity: num(q.affinity),
    distanceM: num(q.distance),
    ...coords(raw),
    areaNames: areaNames(props),
    tags: parseTagList(list(raw.tags)),
    explain: parseExplain(q.explainability),
    closed: props.is_closed === true,
  };
  const hours = parseHours(props.hours);
  if (hours) e.hours = hours;
  const kind = typeName(raw);
  if (kind) e.typeName = kind;
  const address = str(props.address);
  if (address) e.address = address;
  const disambiguation = str(raw.disambiguation);
  if (disambiguation) e.disambiguation = disambiguation;
  const image = str(obj(props.image).url);
  if (image) e.image = image;
  const neighborhood = str(props.neighborhood);
  if (neighborhood) e.neighborhood = neighborhood;
  const channel = str(props.channel);
  if (channel) e.channel = channel;
  const minutes = num(props.duration);
  if (minutes !== null && minutes > 0 && minutes < 600) e.minutes = Math.round(minutes);
  const url = str(props.website);
  if (url && /^https?:\/\//i.test(url)) e.url = url;
  return e;
}

export function parseEntities(body: unknown): QEntity[] {
  const seen = new Set<string>();
  const out: QEntity[] = [];
  for (const row of resultRows(body, "entities")) {
    const e = parseEntity(row);
    if (e && !seen.has(e.id.toUpperCase())) {
      seen.add(e.id.toUpperCase());
      out.push(e);
    }
  }
  return out;
}
