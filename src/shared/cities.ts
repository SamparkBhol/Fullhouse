export interface City {
  name: string;
  lat: number;
  lng: number;
  // How far from the centre a venue in this city can be, in miles, which is the unit /search takes.
  miles: number;
  tz: string;
}

// The supported cities, each with its centre. A city typed that is not here still searches as text.
export const CITIES: City[] = [
  { name: "New York", lat: 40.7128, lng: -74.006, miles: 8, tz: "America/New_York" },
  { name: "Brooklyn", lat: 40.6782, lng: -73.9442, miles: 6, tz: "America/New_York" },
  { name: "Los Angeles", lat: 34.0522, lng: -118.2437, miles: 15, tz: "America/Los_Angeles" },
  { name: "San Francisco", lat: 37.7749, lng: -122.4194, miles: 7, tz: "America/Los_Angeles" },
  { name: "Chicago", lat: 41.8781, lng: -87.6298, miles: 12, tz: "America/Chicago" },
  { name: "Austin", lat: 30.2672, lng: -97.7431, miles: 10, tz: "America/Chicago" },
  { name: "Seattle", lat: 47.6062, lng: -122.3321, miles: 8, tz: "America/Los_Angeles" },
  { name: "Boston", lat: 42.3601, lng: -71.0589, miles: 6, tz: "America/New_York" },
  { name: "Toronto", lat: 43.6532, lng: -79.3832, miles: 10, tz: "America/Toronto" },
  { name: "London", lat: 51.5074, lng: -0.1278, miles: 12, tz: "Europe/London" },
  { name: "Paris", lat: 48.8566, lng: 2.3522, miles: 7, tz: "Europe/Paris" },
  { name: "Berlin", lat: 52.52, lng: 13.405, miles: 10, tz: "Europe/Berlin" },
  { name: "Amsterdam", lat: 52.3676, lng: 4.9041, miles: 6, tz: "Europe/Amsterdam" },
  { name: "Barcelona", lat: 41.3851, lng: 2.1734, miles: 6, tz: "Europe/Madrid" },
  { name: "Lisbon", lat: 38.7223, lng: -9.1393, miles: 6, tz: "Europe/Lisbon" },
  { name: "Mumbai", lat: 19.076, lng: 72.8777, miles: 15, tz: "Asia/Kolkata" },
  { name: "Bengaluru", lat: 12.9716, lng: 77.5946, miles: 12, tz: "Asia/Kolkata" },
  { name: "Tokyo", lat: 35.6762, lng: 139.6503, miles: 15, tz: "Asia/Tokyo" },
];

const ALIASES: Record<string, string> = { nyc: "New York", "new york city": "New York", manhattan: "New York", la: "Los Angeles", sf: "San Francisco", bangalore: "Bengaluru", bombay: "Mumbai" };

function key(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function cityNamed(text: string): City | null {
  const k = key(text);
  const name = ALIASES[k] ?? k;
  return CITIES.find((c) => key(c.name) === key(name)) ?? null;
}

export const MILE_M = 1609.344;
