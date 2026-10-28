import type { Point } from "../geo.ts";

export interface City {
  name: string;
  region: string;
  country: string;
  countryCode: string;
  postcode: string;
  neighborhood: string;
  center: Point;
  streets: string[];
}

export const CITIES: City[] = [
  {
    name: "Portland",
    region: "Oregon",
    country: "United States",
    countryCode: "US",
    postcode: "OR 97209",
    neighborhood: "Pearl District",
    center: { lat: 45.5262, lng: -122.6823 },
    streets: ["NW 11th Ave", "NW Couch St", "NW Glisan St", "NW 13th Ave", "NW Flanders St"],
  },
  {
    name: "Leeds",
    region: "West Yorkshire",
    country: "United Kingdom",
    countryCode: "GB",
    postcode: "LS1 6DT",
    neighborhood: "Kirkgate",
    center: { lat: 53.7964, lng: -1.5401 },
    streets: ["Call Lane", "Kirkgate", "Duncan Street", "Briggate", "Vicar Lane"],
  },
  {
    name: "Ghent",
    region: "East Flanders",
    country: "Belgium",
    countryCode: "BE",
    postcode: "9000",
    neighborhood: "Patershol",
    center: { lat: 51.0569, lng: 3.7219 },
    streets: ["Oudburg", "Kraanlei", "Sluizeken", "Vrijdagmarkt", "Hoogpoort"],
  },
];

// The app sends "<name> <city>" as one query, so the city is the query's last words.
export function splitQuery(query: string): { name: string; city: City | null } {
  const q = query.replace(/\s+/g, " ").trim();
  for (const city of CITIES) {
    const m = new RegExp(`^(.*?)\\s*\\b${city.name}$`, "i").exec(q);
    if (m) return { name: (m[1] ?? "").trim(), city };
  }
  return { name: q, city: null };
}

export function addressIn(city: City, seed: number): string {
  const street = city.streets[seed % city.streets.length] ?? city.streets[0];
  const number = 10 + (seed % 290);
  return city.countryCode === "US" ? `${number} ${street} ${city.name}, ${city.postcode}` : `${street} ${number}, ${city.postcode} ${city.name}`;
}
