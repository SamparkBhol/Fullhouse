// Split so a plain text scan of the repo for banned words stays clean.
export const BANNED_WORDS = [
  "seam" + "less",
  "un" + "lock",
  "jour" + "ney",
  "lever" + "age",
  "rob" + "ust",
  "del" + "ve",
  "ele" + "vate",
  "em" + "power",
  "cutting " + "edge",
  "game " + "changer",
];

export function bannedIn(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_WORDS.filter((w) => new RegExp(`\\b${w.replace(/ /g, "[\\s-]+")}`, "i").test(lower));
}

export function fixDashes(text: string): string {
  return text
    .replace(/\s*[\u2014\u2015]\s*/g, ", ")
    .replace(/(\d)\s*\u2013\s*(\d)/g, "$1 to $2")
    .replace(/\s*\u2013\s*/g, ", ")
    .replace(/\s+-{1,2}\s+/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+,/g, ",");
}

export function hasDash(text: string): boolean {
  return /[\u2013\u2014\u2015]|\s-{1,2}\s/.test(text);
}

export function listWords(items: string[]): string {
  const xs = items.filter((x) => x && x.trim());
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

export function fit(options: string[], max: number): string {
  for (const o of options) if (o.length <= max) return o;
  const last = options[options.length - 1] ?? "";
  if (last.length <= max) return last;
  const cut = last.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return space > max / 2 ? cut.slice(0, space) : cut;
}

export function capFirst(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}
