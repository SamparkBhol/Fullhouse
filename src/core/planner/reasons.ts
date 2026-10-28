import type { Because, EntityRef, StreetRead, StreetTag, Venue } from "../../shared/contract.ts";
import { describeDistance, haversineM } from "../street/geo.ts";
import { streetTagLine } from "../street/words.ts";
import type { Candidate } from "./candidates.ts";
import { FORMATS } from "./formats.ts";

export function provIndex(read: StreetRead, calls: string[]): number {
  for (const call of calls) {
    for (let i = read.provenance.length - 1; i >= 0; i--) {
      const p = read.provenance[i];
      if (p && p.call === call && (p.resultCount > 0 || call === calls[calls.length - 1])) return i;
    }
  }
  return -1;
}

export function streetTagsIndex(read: StreetRead): number {
  return provIndex(read, ["street_tags"]);
}

// With compare, shared holds the venue's side of it, so a tag is called shared only when a loved place carries it too.
// Without compare, shared is the overlap of the street and audience tag reads.
function sharedBecause(read: StreetRead, venue: Venue): Because | null {
  const iCompare = provIndex(read, ["compare"]);
  if (iCompare >= 0) {
    for (const t of read.shared) {
      const place = read.lovedPlaces.find((p) => p.tags.includes(t.id));
      if (place) return { kind: "compare", text: `${venue.entity.name} and ${place.name}, a place nearby its audience loves, are both tagged ${t.name}`, provenance: iCompare };
    }
    return null;
  }
  const t = read.shared[0];
  const iStreet = streetTagsIndex(read);
  return t && iStreet >= 0 ? { kind: "tag", text: `The street and ${venue.entity.name}'s audience both carry ${t.name}`, provenance: iStreet } : null;
}

export function whyFor(c: Candidate, theme: StreetTag[], read: StreetRead, venue: Venue, playlist: EntityRef[]): Because[] {
  const why: Because[] = [];
  if (c.feature) why.push(...c.feature.because);
  const carried = new Set(c.feature?.tags ?? []);
  const relevant = theme.filter((t) => carried.has(t.id) || c.format === "tasting" || (c.format === "listening" && FORMATS.listening.themeNamespaces.includes(t.namespace)));
  const themeGap = read.gaps.find((g) => relevant.some((t) => t.id === g.tag.id));
  if (themeGap) {
    for (const b of themeGap.because) {
      if (!why.some((w) => w.kind === b.kind && w.provenance === b.provenance && w.text.includes(themeGap.tag.name))) why.push(b);
    }
  } else {
    const prov = streetTagsIndex(read);
    const t = relevant[0];
    if (t && prov >= 0 && read.streetTags.some((s) => s.id === t.id) && !why.some((w) => w.kind === "tag" && w.text.includes(t.name))) {
      why.push({ kind: "tag", text: streetTagLine(t.name, venue.entity.name), provenance: prov });
    }
  }
  const shared = sharedBecause(read, venue);
  if (shared) why.push(shared);
  const layer = read.heat[0];
  const top = layer?.cells[0];
  if (layer && top) {
    const d = haversineM(read.center, { lat: top.lat, lng: top.lng });
    why.push({ kind: "heatmap", text: `The strongest heatmap cell sits ${describeDistance(d)} from ${venue.entity.name}`, provenance: layer.provenance });
  }
  const iArtist = provIndex(read, ["insights_artist"]);
  if (playlist.length && iArtist >= 0) {
    why.push({ kind: "affinity", text: `The playlist is the top ${playlist.length} artists Qloo picked for ${venue.entity.name} and its area`, provenance: iArtist });
  }
  return why;
}
