import type { StreetRead } from "../../shared/contract.ts";
import type { DashboardNight, DashboardRead, VenueDashboard } from "../../shared/stats.ts";
import type { NightRecord, VenueRecords } from "../venue/records.ts";
import { nightWindow } from "../zones.ts";
import { venueHistory } from "./venue_history.ts";

function dashboardNight(rec: NightRecord, capacity: number | undefined): DashboardNight {
  const n = rec.night;
  const out: DashboardNight = {
    id: n.id,
    date: n.date,
    start: n.start,
    end: n.end,
    format: n.format,
    title: n.copy.eventTitle,
    status: n.status,
    origin: n.origin,
    rsvps: n.rsvps,
    withdrawn: Boolean(n.withdrawnAt),
    public: rec.published.page,
  };
  if (n.feature) out.feature = n.feature.name;
  if (n.headcount !== undefined) out.headcount = n.headcount;
  const room = n.maxPeople ?? capacity;
  if (room !== undefined) out.room = room;
  return out;
}

// A venue whose reads all came before the history was kept still shows its latest one, counted from its provenance.
// The stored read is large, so it is loaded only then, not on every poll.
async function readsOf(records: VenueRecords, kept: DashboardRead[]): Promise<DashboardRead[]> {
  if (kept.length) return kept;
  const read: StreetRead | undefined = await records.read();
  if (!read) return kept;
  const cached = read.provenance.filter((p) => p.cached).length;
  return [{ at: read.at, calls: read.provenance.length - cached, cached }];
}

function notOver(n: DashboardNight, tz: string, now: Date): boolean {
  try {
    return nightWindow(n, tz).end.getTime() >= now.getTime();
  } catch {
    return false;
  }
}

export async function venueDashboard(records: VenueRecords, now: Date): Promise<VenueDashboard | null> {
  const venue = await records.venue();
  if (!venue) return null;
  const [recs, history, alarm] = await Promise.all([records.nights(), venueHistory(records.store), records.store.getAlarm()]);
  // A room size nobody typed is never shown as "of 40"; only a night's own cap or a room the owner set counts.
  const room = venue.assumed?.room ? undefined : venue.capacity;
  const nights = recs.map((r) => dashboardNight(r, room)).sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const ids = new Set(nights.map((n) => n.id));
  const upcoming = nights.find((n) => n.public && !n.withdrawn && n.status === "approved" && notOver(n, venue.tz, now));
  const out: VenueDashboard = {
    venueId: venue.id,
    tz: venue.tz,
    nights,
    reads: await readsOf(records, history.reads),
    mondays: history.mondays.map((m) => (m.proposal ? { ...m, proposal: { ...m.proposal, published: ids.has(m.proposal.id) } } : { at: m.at, planned: m.planned })),
    next: upcoming
      ? { nightId: upcoming.id, date: upcoming.date, start: upcoming.start, title: upcoming.title, rsvps: upcoming.rsvps, ...(upcoming.room !== undefined ? { room: upcoming.room } : {}) }
      : null,
  };
  if (room !== undefined) out.capacity = room;
  if (alarm) out.nextAlarm = new Date(alarm).toISOString();
  return out;
}
