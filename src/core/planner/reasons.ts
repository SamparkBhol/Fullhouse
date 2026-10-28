import type { Because, EntityRef, StreetRead, StreetTag, Venue } from "../../shared/contract.ts";
import { haversineM } from "../../shared/geo.ts";
import { describeDistance } from "../street/geo.ts";
import { streetTagLine } from "../street/words.ts";
import { gapFor, type Candidate } from "./candidates.ts";
import { FORMATS } from "./formats.ts";
import { provIndex, streetTagsIndex } from "./provenance.ts";

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
  const gap = gapFor(c.format, read);
  const gapProv = gap?.because[0]?.provenance;
  if (gap && gapProv !== undefined) {
    why.push({ kind: "compare", text: `A ${FORMATS[c.format].label} answers a gap the read found: ${gap.note.replace(/\.$/, "")}`, provenance: gapProv });
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
  const top = layer?.cells.find((cell) => !cell.noRead);
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
