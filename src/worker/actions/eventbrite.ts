export const EVENTBRITE_API = "https://www.eventbriteapi.com/v3";

export interface EventbriteOrg {
  id: string;
  name: string;
}

export interface EventbriteDraft {
  organizationId: string;
  name: string;
  summary: string;
  descriptionHtml: string;
  timezone: string;
  startUtc: string;
  endUtc: string;
  currency: string;
  capacity: number;
  venue: { name: string; address?: string; city: string; lat: number; lng: number };
}

export type EventbriteOutcome =
  | { ok: true; url: string; eventId: string; venueAttached: boolean }
  | { ok: false; reason: string };

type Fetcher = typeof fetch;

function headers(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body = (await res.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function reasonOf(status: number, body: Record<string, unknown>, step: string): string {
  const desc = typeof body["error_description"] === "string" ? body["error_description"] : "";
  const code = typeof body["error"] === "string" ? body["error"] : "";
  const said = [code, desc].filter(Boolean).join(": ").slice(0, 240);
  if (status === 401) return `Eventbrite did not accept the saved token while trying to ${step}. Connect Eventbrite again.`;
  return `Eventbrite refused to ${step} (HTTP ${status})${said ? `. It said ${said}` : ""}.`;
}

export async function eventbriteOrganization(token: string, fetcher: Fetcher): Promise<{ ok: true; org: EventbriteOrg } | { ok: false; reason: string }> {
  let res: Response;
  try {
    res = await fetcher(`${EVENTBRITE_API}/users/me/organizations/`, { headers: headers(token) });
  } catch {
    return { ok: false, reason: "Eventbrite could not be reached." };
  }
  const body = await readJson(res);
  if (!res.ok) return { ok: false, reason: reasonOf(res.status, body, "read your organization") };
  const orgs = Array.isArray(body["organizations"]) ? (body["organizations"] as Array<Record<string, unknown>>) : [];
  const first = orgs.find((o) => typeof o["id"] === "string" || typeof o["id"] === "number");
  if (!first) return { ok: false, reason: "This Eventbrite account has no organization to create events under." };
  return { ok: true, org: { id: String(first["id"]), name: typeof first["name"] === "string" && first["name"] ? first["name"] : "Your Eventbrite organization" } };
}

export function venueBody(d: EventbriteDraft): Record<string, unknown> {
  const address: Record<string, unknown> = {
    city: d.venue.city,
    latitude: String(d.venue.lat),
    longitude: String(d.venue.lng),
  };
  if (d.venue.address) address["address_1"] = d.venue.address.slice(0, 250);
  return { venue: { name: d.venue.name.slice(0, 250), address } };
}

export function eventBody(d: EventbriteDraft, venueId: string | null): Record<string, unknown> {
  const event: Record<string, unknown> = {
    name: { html: d.name.slice(0, 250) },
    summary: d.summary.slice(0, 140),
    description: { html: d.descriptionHtml },
    start: { timezone: d.timezone, utc: d.startUtc },
    end: { timezone: d.timezone, utc: d.endUtc },
    currency: d.currency,
    online_event: false,
    listed: true,
    shareable: true,
    capacity: d.capacity,
  };
  if (venueId) event["venue_id"] = venueId;
  return { event };
}

export function ticketBody(d: EventbriteDraft): Record<string, unknown> {
  return { ticket_class: { name: "Free entry", free: true, quantity_total: d.capacity } };
}

export async function createEventbriteEvent(token: string, d: EventbriteDraft, fetcher: Fetcher): Promise<EventbriteOutcome> {
  const post = async (path: string, body: unknown): Promise<{ res: Response; json: Record<string, unknown> } | null> => {
    try {
      const res = await fetcher(`${EVENTBRITE_API}${path}`, { method: "POST", headers: headers(token), body: JSON.stringify(body) });
      return { res, json: await readJson(res) };
    } catch {
      return null;
    }
  };

  let venueId: string | null = null;
  const v = await post(`/organizations/${encodeURIComponent(d.organizationId)}/venues/`, venueBody(d));
  if (v && v.res.ok && (typeof v.json["id"] === "string" || typeof v.json["id"] === "number")) venueId = String(v.json["id"]);

  const draft = venueId
    ? d
    : { ...d, descriptionHtml: `${d.descriptionHtml}<p>Where: ${escapeBasic(d.venue.name)}${d.venue.address ? `, ${escapeBasic(d.venue.address)}` : ""}, ${escapeBasic(d.venue.city)}</p>` };
  const e = await post(`/organizations/${encodeURIComponent(d.organizationId)}/events/`, eventBody(draft, venueId));
  if (!e) return { ok: false, reason: "Eventbrite could not be reached while creating the event." };
  if (!e.res.ok) return { ok: false, reason: reasonOf(e.res.status, e.json, "create the event") };
  const eventId = typeof e.json["id"] === "string" || typeof e.json["id"] === "number" ? String(e.json["id"]) : "";
  const url = typeof e.json["url"] === "string" ? e.json["url"] : "";
  if (!eventId) return { ok: false, reason: "Eventbrite created something but did not return an event id." };

  const t = await post(`/events/${encodeURIComponent(eventId)}/ticket_classes/`, ticketBody(d));
  if (!t) return { ok: false, reason: `The event exists as a draft but Eventbrite could not be reached to add tickets. Draft: ${url}` };
  if (!t.res.ok) return { ok: false, reason: `${reasonOf(t.res.status, t.json, "add free tickets")} The draft is at ${url}` };

  const p = await post(`/events/${encodeURIComponent(eventId)}/publish/`, {});
  if (!p) return { ok: false, reason: `The event exists as a draft but Eventbrite could not be reached to publish it. Draft: ${url}` };
  if (!p.res.ok || p.json["published"] === false) {
    return { ok: false, reason: `${reasonOf(p.res.status, p.json, "publish the event")} The draft is at ${url}` };
  }
  return { ok: true, url: url || `https://www.eventbrite.com/e/${eventId}`, eventId, venueAttached: venueId !== null };
}

function escapeBasic(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CURRENCY_BY_ZONE: Array<[RegExp, string]> = [
  [/^Europe\/(London|Belfast|Guernsey|Isle_of_Man|Jersey)$/, "GBP"],
  [/^Europe\/Dublin$/, "EUR"],
  [/^Europe\/(Zurich|Busingen)$/, "CHF"],
  [/^Europe\/(Stockholm)$/, "SEK"],
  [/^Europe\/(Oslo)$/, "NOK"],
  [/^Europe\/(Copenhagen)$/, "DKK"],
  [/^Europe\/(Warsaw)$/, "PLN"],
  [/^Europe\/(Prague)$/, "CZK"],
  [/^Europe\//, "EUR"],
  [/^America\/(Toronto|Vancouver|Montreal|Edmonton|Winnipeg|Halifax|Regina|St_Johns)$/, "CAD"],
  [/^America\/Mexico_City$/, "MXN"],
  [/^America\/Sao_Paulo$/, "BRL"],
  [/^Australia\//, "AUD"],
  [/^Pacific\/Auckland$/, "NZD"],
  [/^Asia\/(Kolkata|Calcutta)$/, "INR"],
  [/^Asia\/Singapore$/, "SGD"],
  [/^Asia\/Tokyo$/, "JPY"],
  [/^Asia\/Hong_Kong$/, "HKD"],
];

// Tickets are free; Eventbrite still requires a currency on every event.
export function currencyForZone(tz: string): string {
  for (const [re, cur] of CURRENCY_BY_ZONE) if (re.test(tz)) return cur;
  return "USD";
}
