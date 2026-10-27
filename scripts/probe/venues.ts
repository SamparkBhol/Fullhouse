export type VenueKind = "bookshop" | "record shop" | "cafe" | "bar" | "brewery" | "gallery";

export interface ProbeVenue {
  slug: string;
  name: string;
  city: string;
  kind: VenueKind;
}

export const VENUES: ProbeVenue[] = [
  { slug: "housing-works", name: "Housing Works Bookstore Cafe", city: "New York", kind: "bookshop" },
  { slug: "caffe-reggio", name: "Caffe Reggio", city: "New York", kind: "cafe" },
  { slug: "books-are-magic", name: "Books Are Magic", city: "Brooklyn", kind: "bookshop" },
  { slug: "brooklyn-brewery", name: "Brooklyn Brewery", city: "Brooklyn", kind: "brewery" },
  { slug: "green-mill", name: "The Green Mill", city: "Chicago", kind: "bar" },
  { slug: "waterloo-records", name: "Waterloo Records", city: "Austin", kind: "record shop" },
  { slug: "city-lights", name: "City Lights Booksellers", city: "San Francisco", kind: "bookshop" },
  { slug: "ritual-coffee", name: "Ritual Coffee Roasters", city: "San Francisco", kind: "cafe" },
  { slug: "skylight-books", name: "Skylight Books", city: "Los Angeles", kind: "bookshop" },
  { slug: "elliott-bay", name: "Elliott Bay Book Company", city: "Seattle", kind: "bookshop" },
  { slug: "rough-trade-east", name: "Rough Trade East", city: "London", kind: "record shop" },
  { slug: "photographers-gallery", name: "The Photographers' Gallery", city: "London", kind: "gallery" },
  { slug: "shakespeare-and-company", name: "Shakespeare and Company", city: "Paris", kind: "bookshop" },
  { slug: "the-barn", name: "The Barn", city: "Berlin", kind: "cafe" },
  { slug: "brouwerij-t-ij", name: "Brouwerij 't IJ", city: "Amsterdam", kind: "brewery" },
];

// Experiments run on the first three of these that resolve, one per continent where possible.
export const EXPERIMENT_PREFERENCE = ["housing-works", "rough-trade-east", "shakespeare-and-company", "city-lights", "the-barn"];

export const NAME_ONLY_SEARCH = new Set(["housing-works", "rough-trade-east", "the-barn"]);
export const UNTYPED_SEARCH = new Set(["caffe-reggio", "the-barn"]);

export function citiesOf(venues: ProbeVenue[]): string[] {
  return [...new Set(venues.map((v) => v.city))];
}

export function citySlug(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
