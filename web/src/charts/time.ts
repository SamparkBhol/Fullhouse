function fmt(opts: Intl.DateTimeFormatOptions, tz = "UTC"): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-GB", { hourCycle: "h23", ...opts, timeZone: tz });
  } catch {
    return new Intl.DateTimeFormat("en-GB", { hourCycle: "h23", ...opts, timeZone: "UTC" });
  }
}

export function clockTime(iso: string | number, tz = "UTC", seconds = false): string {
  return fmt(seconds ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : { hour: "2-digit", minute: "2-digit" }, tz).format(new Date(iso));
}

export function dayMonth(iso: string | number, tz = "UTC"): string {
  return fmt({ day: "numeric", month: "short" }, tz).format(new Date(iso));
}

export function weekdayDay(iso: string | number, tz = "UTC"): string {
  return fmt({ weekday: "short", day: "numeric", month: "short" }, tz).format(new Date(iso));
}

export function longDay(iso: string | number, tz = "UTC"): string {
  return fmt({ weekday: "long", day: "numeric", month: "long" }, tz).format(new Date(iso));
}

export function stamp(iso: string, tz = "UTC"): string {
  return fmt({ weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, tz).format(new Date(iso)).replace(" at ", ", ");
}

const DAY_BUCKET_HOURS = 24;

function localDay(iso: string | number, tz: string): string {
  return fmt({ year: "numeric", month: "2-digit", day: "2-digit" }, tz).format(new Date(iso));
}

// Axis labels for a bucket: an hour for 24 hours, a UTC date for 30 days, and for 7 days the weekday on the first
// bucket of each day only, so a day's four buckets carry one label between them.
export function bucketTick(iso: string, bucketHours: number, tz = "UTC"): string {
  if (bucketHours >= DAY_BUCKET_HOURS) return dayMonth(iso, "UTC");
  if (bucketHours > 1) {
    const before = Date.parse(iso) - bucketHours * 3_600_000;
    return localDay(before, tz) === localDay(iso, tz) ? "" : fmt({ weekday: "short" }, tz).format(new Date(iso));
  }
  return clockTime(iso, tz);
}

// Day buckets are UTC days, so they are named in UTC; shorter buckets read in the viewer's zone.
export function bucketSpan(iso: string, bucketHours: number, tz = "UTC"): string {
  if (bucketHours >= DAY_BUCKET_HOURS) return longDay(iso, "UTC");
  const end = new Date(Date.parse(iso) + bucketHours * 3_600_000).toISOString();
  return `${weekdayDay(iso, tz)}, ${clockTime(iso, tz)} to ${clockTime(end, tz)}`;
}

// The index of the first bucket that was counted. Buckets that ended before counting began were never counted,
// which is not the same as nothing happening in them.
export function countedFrom(buckets: readonly string[], bucketHours: number, since: string | null): number {
  if (!since) return 0;
  const start = Date.parse(since);
  const first = buckets.findIndex((b) => Date.parse(b) + bucketHours * 3_600_000 > start);
  return first < 0 ? buckets.length : first;
}

// Zone ids use underscores for spaces, as in America/Los_Angeles.
export function zoneName(tz: string): string {
  return tz.replace(/_/g, " ");
}

export function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function untilWords(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m} min`;
  return h ? `${h} h` : `${m} min`;
}

export function count(n: number): string {
  return new Intl.NumberFormat("en-GB").format(n);
}
