import type { QlooType } from "../../src/shared/contract.ts";
import { TYPE_URN, isoDate, locationFilter, locationSignal, trendWindow, wktPoint, type Params } from "../../src/core/qloo/index.ts";
import { HEAT_RADIUS_M, LOVED_RADIUS_M } from "./config.ts";
import {
  PLACE,
  crossParams,
  lovedParams,
  spec,
  streetTagParams,
  trendParams,
  urnFor,
  type CallSpec,
  type FollowUp,
  type ResolvedVenue,
} from "./plan.ts";
import type { ArrayStyle } from "./record.ts";

type Make = (call: string, path: string, params: Params, question: string, arrays?: ArrayStyle) => CallSpec;

function maker(v: ResolvedVenue): Make {
  return (call, path, params, question, arrays) => {
    const s = spec(v.venue.slug, "experiment", call, path, params, question);
    if (arrays) s.arrays = arrays;
    return s;
  };
}

const HEAT_BOUNDARIES = ["urn:entity:locality", "neighborhood", "city"];
const WEEK_MS = 7 * 86400000;

// Each window is weeks ago at the start and at the end, so length and age can be told apart.
const TREND_WINDOWS: Array<{ label: string; from: number; to: number; take: number }> = [
  { label: "9w", from: 9, to: 0, take: 30 },
  { label: "12w", from: 12, to: 0, take: 30 },
  { label: "16w", from: 16, to: 0, take: 30 },
  { label: "20w", from: 20, to: 0, take: 50 },
  { label: "26w_take50", from: 26, to: 0, take: 50 },
  { label: "52w", from: 52, to: 0, take: 50 },
  { label: "26w_to_18w", from: 26, to: 18, take: 50 },
];

function windowAgo(now: Date, from: number, to: number): { start: string; end: string } {
  return { start: isoDate(new Date(now.getTime() - from * WEEK_MS)), end: isoDate(new Date(now.getTime() - to * WEEK_MS)) };
}

const APP_ONLY_TYPES: QlooType[] = ["book", "movie", "tv_show", "podcast", "videogame"];

function appCross(x: Make, v: ResolvedVenue, gameUrn: string): CallSpec[] {
  return APP_ONLY_TYPES.map((t) =>
    x(`app_cross_${t}`, "/v2/insights", crossParams(urnFor(t, gameUrn), locationSignal(v.lat, v.lng)), `What does the app's ${t} call, POINT signal with bias.trends=high, return?`),
  );
}

function placeExperiments(x: Make, v: ResolvedVenue): CallSpec[] {
  const sig = locationSignal(v.lat, v.lng);
  return [
    x("loved_filter_query", "/v2/insights", { "filter.type": PLACE, "filter.location.query": v.area, ...sig, take: "30" }, `Does filter.location.query=${v.area} keep places as close as the POINT and radius filter?`),
    x("loved_signal_query", "/v2/insights", lovedParams(v, { "signal.location.query": v.area }), "Does signal.location.query reorder places the way the POINT signal does?"),
    x("loved_no_signal", "/v2/insights", lovedParams(v, {}), "Without any signal, is affinity null and the order popularity?"),
    x("loved_signal_radius", "/v2/insights", lovedParams(v, { ...locationSignal(v.lat, v.lng), "signal.location.radius": String(LOVED_RADIUS_M) }), "Does signal.location.radius change the ranking?"),
    x("loved_entity_signal", "/v2/insights", { ...lovedParams(v, { "signal.interests.entities": v.id }), "feature.explainability": "true" }, "With the venue as signal, what keys does explainability use?"),
  ];
}

function tagExperiments(x: Make, v: ResolvedVenue): CallSpec[] {
  const sig = locationSignal(v.lat, v.lng);
  return [
    x("street_tags_open", "/v2/insights", { "filter.type": "urn:tag", ...sig, take: "50" }, "Which tag namespaces does a location signal return with no namespace filter?"),
    x("street_tags_signal_query", "/v2/insights", { ...streetTagParams(), "signal.location.query": v.venue.city }, "How does the city name signal differ from the venue POINT?"),
    x("venue_tags_open", "/v2/insights", { "filter.type": "urn:tag", "signal.interests.entities": v.id, take: "50" }, "Which namespaces describe the venue's own audience with no namespace filter?"),
  ];
}

function crossExperiments(x: Make, v: ResolvedVenue): CallSpec[] {
  const sig = locationSignal(v.lat, v.lng);
  return [
    x("cross_artist_no_bias", "/v2/insights", crossParams(TYPE_URN.artist, sig, false), "What does bias.trends=high change for artists?"),
    x("cross_artist_city_query", "/v2/insights", crossParams(TYPE_URN.artist, { "signal.location.query": v.venue.city }), "Does a city name signal give different artists from the venue POINT?"),
  ];
}

function mapExperiments(x: Make, v: ResolvedVenue, f: FollowUp, slot: number): CallSpec[] {
  const boundary = HEAT_BOUNDARIES[slot % HEAT_BOUNDARIES.length] ?? "neighborhood";
  const calls = [
    x(`heat_boundary_${boundary.split(":").pop()}`, "/v2/insights", { "filter.type": "urn:heatmap", ...locationFilter(v.lat, v.lng, HEAT_RADIUS_M), "signal.interests.entities": v.id, "output.heatmap.boundary": boundary }, `What does output.heatmap.boundary=${boundary} return?`),
    x("demo_venue", "/v2/insights", { "filter.type": "urn:demographics", "signal.interests.entities": v.id }, "What demographics block comes back for the venue entity?"),
  ];
  if (f.topLoved.length) {
    calls.push(x("compare_typed", "/v2/analysis/compare", { "a.signal.interests.entities": v.id, "b.signal.interests.entities": f.topLoved, "filter.type": PLACE, take: "20" }, "Does filter.type change the compare output layout?"));
  }
  return calls;
}

function trendExperiments(x: Make, f: FollowUp, now: Date, slot: number): CallSpec[] {
  const first = f.trendTargets[0];
  if (!first) return [];
  const calls = [x("trending_long", "/v2/trending", trendParams(first, trendWindow(now, 26)), "How many weekly points does a 26 week window return?")];
  if (slot === 0) {
    for (const w of TREND_WINDOWS) {
      calls.push(x(`trending_${w.label}`, "/v2/trending", trendParams(first, windowAgo(now, w.from, w.to), w.take), `Does a window from ${w.from} to ${w.to} weeks ago return points?`));
    }
  }
  return calls;
}

// Asked once: each of these settles a yes or no question that does not depend on the venue.
function onceExperiments(x: Make, v: ResolvedVenue, gameUrn: string): CallSpec[] {
  const sig = locationSignal(v.lat, v.lng);
  return [
    x("venue_entity", "/entities", { entity_ids: v.id }, "What does /entities add over the search hit?"),
    ...appCross(x, v, gameUrn),
    x("cross_artist_venue_only", "/v2/insights", crossParams(TYPE_URN.artist, { "signal.interests.entities": v.id }), "Does the POINT add anything once the venue entity is the signal?"),
    x("cross_artist_venue_biased", "/v2/insights", crossParams(TYPE_URN.artist, { "signal.interests.entities": v.id, ...sig }), "Does bias.trends=high change artists when the venue entity is the signal?"),
    x("street_tags_repeat", "/v2/insights", { ...streetTagParams(), ...sig }, "Are repeated keys read the same as comma joined arrays?", "repeat"),
    x("cross_artist_no_location", "/v2/insights", { "filter.type": TYPE_URN.artist, "bias.trends": "high", take: "10" }, "Is a call with no signal at all accepted?"),
    x("demo_location_only", "/v2/insights", { "filter.type": "urn:demographics", ...sig }, "Does a location alone produce demographics?"),
    x("loved_point_no_radius", "/v2/insights", { "filter.type": PLACE, "filter.location": wktPoint(v.lat, v.lng), ...sig, take: "10" }, "Does a POINT without filter.location.radius match nothing?"),
  ];
}

export function experimentCalls(v: ResolvedVenue, f: FollowUp, gameUrn: string, now: Date, slot: number): CallSpec[] {
  const x = maker(v);
  return [
    ...placeExperiments(x, v),
    ...tagExperiments(x, v),
    ...crossExperiments(x, v),
    ...mapExperiments(x, v, f, slot),
    ...trendExperiments(x, f, now, slot),
    ...(slot === 0 ? onceExperiments(x, v, gameUrn) : []),
  ];
}
