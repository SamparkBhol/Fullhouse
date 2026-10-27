export interface SavedVenue {
  id: string;
  name: string;
  city: string;
}

const TOKEN_PREFIX = "fullhouse.owner.";
const VENUES_KEY = "fullhouse.venues";

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const memoryTokens = new Map<string, string>();

export function saveToken(venueId: string, token: string): void {
  memoryTokens.set(venueId, token);
  try {
    local()?.setItem(TOKEN_PREFIX + venueId, token);
  } catch {
    // Private mode or blocked storage: the token lives in memory for this tab.
  }
}

export function loadToken(venueId: string): string | null {
  const fromMemory = memoryTokens.get(venueId);
  if (fromMemory) return fromMemory;
  try {
    return local()?.getItem(TOKEN_PREFIX + venueId) ?? null;
  } catch {
    return null;
  }
}

export function forgetVenue(venueId: string): void {
  memoryTokens.delete(venueId);
  try {
    local()?.removeItem(TOKEN_PREFIX + venueId);
    const rest = savedVenues().filter((v) => v.id !== venueId);
    local()?.setItem(VENUES_KEY, JSON.stringify(rest));
  } catch {
    // Nothing stored, nothing to remove.
  }
}

export function savedVenues(): SavedVenue[] {
  try {
    const raw = local()?.getItem(VENUES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedVenue =>
        typeof v === "object" && v !== null && typeof v.id === "string" && typeof v.name === "string",
    );
  } catch {
    return [];
  }
}

export function rememberVenue(venue: SavedVenue): void {
  try {
    const rest = savedVenues().filter((v) => v.id !== venue.id);
    local()?.setItem(VENUES_KEY, JSON.stringify([venue, ...rest].slice(0, 8)));
  } catch {
    // The venue still works through its owner link.
  }
}

// The owner link carries the token in the fragment, as "#token=..." or bare. A bare value must be long enough
// that an in page anchor is never mistaken for a token.
export function tokenFromFragment(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  if (raw.includes("=")) {
    const params = new URLSearchParams(raw);
    return params.get("token") ?? params.get("t") ?? params.get("owner") ?? params.get("k");
  }
  const bare = decodeURIComponent(raw);
  return /^[A-Za-z0-9._~+/=-]{20,}$/.test(bare) ? bare : null;
}

export function sessionGet<T>(key: string): T | null {
  try {
    const raw = session()?.getItem("fullhouse." + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function sessionSet(key: string, value: unknown): void {
  try {
    session()?.setItem("fullhouse." + key, JSON.stringify(value));
  } catch {
    // Only a convenience cache.
  }
}
