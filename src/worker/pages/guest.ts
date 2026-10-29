import type { NightPlan } from "../../shared/contract.ts";
import { listWords, plainName } from "../../shared/words.ts";

const SHOWN_TAGS = 3;

// Qloo tag names are title cased labels; in a sentence they read as plain words, except names such as R&B.
export function tagWords(names: string[]): string[] {
  return names.map((n) =>
    n
      .trim()
      .split(/\s+/)
      .map((w) => (/[A-Z].*[A-Z&]/.test(w) ? w : w.toLowerCase()))
      .join(" "),
  );
}

// Guests get one plain line from what both crowds share, never a rank. The partner is named only after it said yes.
export function guestLine(night: Pick<NightPlan, "match">, venueName: string, partnerName?: string): string {
  const tags = tagWords((night.match?.shared ?? []).slice(0, SHOWN_TAGS).map((t) => t.name));
  if (!tags.length) return "";
  return partnerName ? `Both crowds go for ${listWords(tags)}` : `People who like ${plainName(venueName)} go for ${listWords(tags)}`;
}

export function guestSource(venueName: string, partnerName?: string): string {
  const v = plainName(venueName);
  const who = partnerName ? `people who like ${v} and people who like ${plainName(partnerName)}` : `people who like ${v}`;
  return `Picked with Qloo taste data for ${who}`;
}

// "America/New_York" reads as "New York time" on a page a guest sees.
export function zoneCity(tz: string): string {
  const city = tz.split("/").pop()?.replace(/_/g, " ").trim();
  return city ? `${city} time` : tz;
}
