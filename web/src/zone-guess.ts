import type { VenueCandidate } from "../../src/shared/contract.ts";

// Qloo gives a venue's address and point but no time zone, so the zone is read from the address the way a person
// would: the city, then the state or province, then the country. The phone's own zone is only a last resort.

const US_STATES: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago", CA: "America/Los_Angeles",
  CO: "America/Denver", CT: "America/New_York", DC: "America/New_York", DE: "America/New_York", FL: "America/New_York",
  GA: "America/New_York", HI: "Pacific/Honolulu", IA: "America/Chicago", ID: "America/Boise", IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis", KS: "America/Chicago", KY: "America/New_York", LA: "America/Chicago", MA: "America/New_York",
  MD: "America/New_York", ME: "America/New_York", MI: "America/Detroit", MN: "America/Chicago", MO: "America/Chicago",
  MS: "America/Chicago", MT: "America/Denver", NC: "America/New_York", ND: "America/Chicago", NE: "America/Chicago",
  NH: "America/New_York", NJ: "America/New_York", NM: "America/Denver", NV: "America/Los_Angeles", NY: "America/New_York",
  OH: "America/New_York", OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York", PR: "America/Puerto_Rico",
  RI: "America/New_York", SC: "America/New_York", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago",
  UT: "America/Denver", VA: "America/New_York", VT: "America/New_York", WA: "America/Los_Angeles", WI: "America/Chicago",
  WV: "America/New_York", WY: "America/Denver",
};

const CA_PROVINCES: Record<string, string> = {
  AB: "America/Edmonton", BC: "America/Vancouver", MB: "America/Winnipeg", NB: "America/Moncton", NL: "America/St_Johns",
  NS: "America/Halifax", NT: "America/Yellowknife", NU: "America/Iqaluit", ON: "America/Toronto", PE: "America/Halifax",
  QC: "America/Toronto", SK: "America/Regina", YT: "America/Whitehorse",
};

const AU_STATES: Record<string, string> = {
  ACT: "Australia/Sydney", NSW: "Australia/Sydney", NT: "Australia/Darwin", QLD: "Australia/Brisbane",
  SA: "Australia/Adelaide", TAS: "Australia/Hobart", VIC: "Australia/Melbourne", WA: "Australia/Perth",
};

// Countries with one zone for nearly everyone, as Qloo writes them at the end of an address.
const COUNTRIES: Record<string, string> = {
  "united kingdom": "Europe/London", ireland: "Europe/Dublin", france: "Europe/Paris", germany: "Europe/Berlin",
  netherlands: "Europe/Amsterdam", belgium: "Europe/Brussels", spain: "Europe/Madrid", portugal: "Europe/Lisbon",
  italy: "Europe/Rome", switzerland: "Europe/Zurich", austria: "Europe/Vienna", denmark: "Europe/Copenhagen",
  sweden: "Europe/Stockholm", norway: "Europe/Oslo", finland: "Europe/Helsinki", poland: "Europe/Warsaw",
  czechia: "Europe/Prague", "czech republic": "Europe/Prague", hungary: "Europe/Budapest", greece: "Europe/Athens",
  turkey: "Europe/Istanbul", israel: "Asia/Jerusalem", india: "Asia/Kolkata", singapore: "Asia/Singapore",
  japan: "Asia/Tokyo", "south korea": "Asia/Seoul", taiwan: "Asia/Taipei", "hong kong": "Asia/Hong_Kong",
  thailand: "Asia/Bangkok", "new zealand": "Pacific/Auckland", "south africa": "Africa/Johannesburg",
  mexico: "America/Mexico_City", panama: "America/Panama", argentina: "America/Argentina/Buenos_Aires",
  brazil: "America/Sao_Paulo", colombia: "America/Bogota", peru: "America/Lima", chile: "America/Santiago",
};

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function byCity(zones: string[], place: string): string | null {
  const text = ` ${plain(place).replace(/[^a-z]+/g, " ")} `;
  const hits = zones.filter((z) => {
    const city = plain(z.split("/").pop() ?? "").replace(/_/g, " ");
    return city.length > 3 && text.includes(` ${city} `);
  });
  return hits.sort((a, b) => b.length - a.length)[0] ?? null;
}

function byRegion(address: string): string | null {
  const us = /,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$/.exec(address);
  if (us?.[1] && US_STATES[us[1]]) return US_STATES[us[1]] ?? null;
  const ca = /,\s*([A-Z]{2})\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d\s+Canada\s*$/i.exec(address);
  if (ca?.[1] && CA_PROVINCES[ca[1].toUpperCase()]) return CA_PROVINCES[ca[1].toUpperCase()] ?? null;
  const au = /\b(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\s+\d{4}\s+Australia\s*$/i.exec(address);
  if (au?.[1]) return AU_STATES[au[1].toUpperCase()] ?? null;
  return null;
}

function byCountry(address: string): string | null {
  const text = plain(address).trim();
  const hit = Object.keys(COUNTRIES).find((c) => text.endsWith(c));
  return hit ? (COUNTRIES[hit] ?? null) : null;
}

export function offsetHours(zone: string, at = new Date()): number | null {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
    const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
    if (!m) return name === "GMT" ? 0 : null;
    return (m[1] === "-" ? -1 : 1) * (Number(m[2]) + Number(m[3] ?? 0) / 60);
  } catch {
    return null;
  }
}

// The sun's offset at a longitude is a rough check that a zone is not on another continent.
export function nearLongitude(zone: string, lng: number): boolean {
  const off = offsetHours(zone);
  return off !== null && Math.abs(off - lng / 15) <= 2.5;
}

export function guessZone(candidate: VenueCandidate, city: string, zones: string[]): string | null {
  const address = candidate.address ?? "";
  const found = byRegion(address) ?? byCity(zones, `${address} ${city}`) ?? byCountry(address);
  return found && nearLongitude(found, candidate.lng) ? found : null;
}
