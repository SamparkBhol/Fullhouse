const CALL_NAMES: Record<string, string> = {
  find_venue: "Venue search by name and city",
  find_venue_by_name: "Venue search by name alone",
  street_tags: "The street's taste tags",
  venue_tags: "Your venue's taste tags",
  loved_places: "Places nearby your crowd loves",
  loves_back: "Whether a neighbour's crowd loves you back",
  heat_venue: "Where your crowd gathers",
  heat_street: "Where places like yours do well",
  compare: "Your venue against your partner",
  insights_artist: "Artists your crowd loves",
  insights_book: "Books your crowd loves",
  insights_movie: "Films your crowd loves",
  insights_tv_show: "TV shows your crowd loves",
  insights_podcast: "Podcasts your crowd loves",
  insights_videogame: "Video games your crowd loves",
  verify_own: "Full House's own picks, checked by id",
  verify_place: "Place lookup",
  verify_artist: "Artist lookup",
  verify_other: "Catalog lookup",
};

export function callName(call: string): string {
  return CALL_NAMES[call] ?? call.replace(/_/g, " ");
}
