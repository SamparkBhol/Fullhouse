export function fmtTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function fmtDay(iso: string): string {
  return iso.slice(0, 10);
}

// A location signal scores street tags almost level, so they are named as a set and never by rank.
export function streetTagLine(tag: string, venueName: string): string {
  return `${tag} is among the taste tags Qloo returns for the area around ${venueName}`;
}

export function sharesStreetTagLine(tag: string, venueName: string): string {
  return `Tagged ${tag}, which the street around ${venueName} and its audience both carry`;
}

// Qloo's explainability shares are fractions of one, so they are written as such and never as percentages.
export function share(n: number): string {
  return n.toFixed(2);
}
