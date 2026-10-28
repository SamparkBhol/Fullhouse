import { prettyTag } from "./format.ts";

// Search hits and places carry dozens of Qloo tags, from what a place is down to its payment methods.
// These namespaces say what a place is or feels like, so the first tags shown come from them, in this order.
const DESCRIBING = [
  "urn:tag:genre:place",
  "urn:tag:category:place",
  "urn:tag:activity_type:qloo",
  "urn:tag:ambience:qloo",
  "urn:tag:interests:qloo",
  "urn:tag:offerings:place",
  "urn:tag:decor:qloo",
];

function namespaceOf(id: string): string {
  return id.split(":").slice(0, 4).join(":");
}

export function tagWord(idOrName: string): string {
  if (!idOrName.startsWith("urn:")) return prettyTag(idOrName);
  const parts = idOrName.split(":");
  return parts.length > 4 ? prettyTag(parts[parts.length - 1] ?? "") : "";
}

export function describingTags(ids: string[], max: number): string[] {
  const words: string[] = [];
  for (const ns of DESCRIBING) {
    for (const id of ids) {
      if (namespaceOf(id) !== ns) continue;
      const word = tagWord(id);
      if (word && !words.some((w) => w.toLowerCase() === word.toLowerCase())) words.push(word);
      if (words.length >= max) return words;
    }
  }
  return words;
}
