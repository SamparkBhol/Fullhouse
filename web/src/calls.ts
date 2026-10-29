const CALL_NAMES: Record<string, string> = {
  find_venue: "Venue search by name and city",
  find_venue_by_name: "Venue search by name alone",
  street_tags: "The street's taste tags",
  venue_tags: "Your venue's taste tags",
  loved_places: "Places nearby your audience loves",
  heat_venue: "Heat map for your venue",
  heat_street: "Heat map for places like yours",
  compare: "Your venue against the places your audience loves",
  demographics: "Your audience in aggregate",
  insights_artist: "Artists your audience loves",
  insights_book: "Books your audience loves",
  insights_movie: "Films your audience loves",
  insights_tv_show: "TV shows your audience loves",
  insights_podcast: "Podcasts your audience loves",
  insights_videogame: "Video games your audience loves",
  verify_place: "Place lookup",
  verify_artist: "Artist lookup",
  verify_other: "Catalog lookup",
};

export function callName(call: string): string {
  return CALL_NAMES[call] ?? call.replace(/_/g, " ");
}
