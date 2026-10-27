export interface OpenQuestion {
  id: string;
  question: string;
  guard: string;
  probe: string;
}

export const QLOO_OPEN_QUESTIONS: OpenQuestion[] = [
  {
    id: "array_style",
    question: "Are array parameters read as one comma separated value (OpenAPI form style, explode false) or as repeated keys?",
    guard: "Arrays are sent comma joined; QlooOptions.arrays set to repeat switches every call to repeated keys.",
    probe: "One urn:tag insights call with two filter.tag.types values, sent both ways, compared by result namespaces.",
  },
  {
    id: "videogame_urn",
    question: "Does insights accept urn:entity:videogame (OpenAPI, schema page) or urn:entity:video_game (developer guide)?",
    guard: "The read tries videogame first and retries video_game on a 400 or 403; trending reuses the spelling that worked.",
    probe: "One insights call with each spelling.",
  },
  {
    id: "signal_location_cross_domain",
    question: "Does signal.location change the ranking for artist, book, movie, tv_show, podcast and videogame? The per type table lists no location parameter for them.",
    guard: "Null affinity everywhere is reported as popularity order, never as zero, with a limits line.",
    probe: "Artist insights with and without signal.location for two distant cities, compared by overlap.",
  },
  {
    id: "tag_types_multi",
    question: "Does urn:tag mode accept several comma separated filter.tag.types values, and diversify.by=subtype?",
    guard: "An empty street tag read is rerun once without namespace filters and says so in the limits.",
    probe: "urn:tag with signal.location and the ten namespaces, then with one namespace.",
  },
  {
    id: "explainability_keys",
    question: "What JSON shape does per result query.explainability take, and does a location only signal produce any entries?",
    guard: "The parser accepts id to score maps, arrays of objects and nested maps, skips warnings, and shows only inputs it can name.",
    probe: "Place insights with feature.explainability=true, once with signal.location only and once with an entity signal.",
  },
  {
    id: "compare_shape",
    question: "Does /v2/analysis/compare return results.tags with query.score, a flat array, or entities, and does it carry per side scores?",
    guard: "Tags are read from all three layouts; without tags, shared tags come from the two tag reads and the limits say so.",
    probe: "Compare the venue against its top three loved places, with and without filter.type.",
  },
  {
    id: "trending_shape",
    question: "With signal.interests.entities, does /v2/trending return the weekly series under results.trending or the ranked list under results.entities?",
    guard: "Both are parsed; a ranked list counts as rising only when the entity is in it, otherwise the trend is unknown.",
    probe: "One trending call for a known artist over eight weeks.",
  },
  {
    id: "trending_velocity_sign",
    question: "Is a positive population_rank_velocity a move up or down the ranking, and is velocity_fold_change centred on 1?",
    guard: "Series trends come from population_rank and population_percentile across the window; velocity fields are used only for a single point.",
    probe: "Compare the sign of population_rank_velocity with the change in population_rank between consecutive weeks.",
  },
  {
    id: "demographics_location",
    question: "Does urn:demographics accept signal.location together with signal.interests.tags?",
    guard: "Demographics are optional; a failure or empty answer becomes a limits line.",
    probe: "One demographics call with the street's top three tags and the venue point.",
  },
  {
    id: "heatmap_point",
    question: "Does urn:heatmap return cells for a POINT filter.location with filter.location.radius, and does operator.signal.interests.tags=union apply?",
    guard: "Cells without affinity_rank are counted as no read and not drawn; an empty layer becomes a limits line.",
    probe: "Heatmap around the demo venue with radius 2000 and one, then three, tags.",
  },
  {
    id: "search_location",
    question: "Does /search accept filter.location as lat,lon with filter.radius in miles, and do locality hits carry coordinates?",
    guard: "City search falls back to the locality id, then to filter.address with the city name.",
    probe: "Search a known venue name with each location form.",
  },
  {
    id: "search_coordinates",
    question: "Do /search place hits carry properties.lat and properties.lon?",
    guard: "Hits without coordinates are hydrated with one /entities call and dropped if still unmapped.",
    probe: "Search a known place and inspect properties.",
  },
  {
    id: "no_results_404",
    question: "Do /search, /entities and compare answer an empty result with HTTP 404 as the OpenAPI says?",
    guard: "A 404 is read as nothing found, never retried, and shown as an empty result.",
    probe: "Search a nonsense name.",
  },
];
