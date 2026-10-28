import { resultRows } from "./results.ts";
import { isObj, num, obj, str } from "./values.ts";

export interface QTag {
  id: string;
  name: string;
  namespace: string;
  score: number | null;
  popularity: number | null;
}

export function tagNamespace(id: string): string {
  const parts = id.split(":");
  return parts.length >= 4 ? parts.slice(0, 4).join(":") : id;
}

export function tagLabel(idOrName: string): string {
  if (!idOrName.startsWith("urn:")) return idOrName;
  const last = idOrName.split(":").pop() ?? idOrName;
  return last.replace(/_/g, " ").trim();
}

// Live names include "Alt- country" and "+young Adult". A hyphen with a space beside it would read as a dash,
// and a leading symbol as a typo, so both go. Hyphens inside a word stay.
export function cleanTagName(name: string): string {
  return name
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+-\s*|\s*-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// A bare namespace such as urn:tag:genre:place ("Place") says nothing about a venue.
export function isNamespaceRoot(tag: Pick<QTag, "id" | "namespace">): boolean {
  return tag.id === tag.namespace;
}

function namespaceFrom(v: unknown): string | undefined {
  const s = str(v);
  return s && s.startsWith("urn:tag:") ? s : undefined;
}

// Four live layouts: tag mode and compare {tag_id, subtype, query}, search hits {tag_id, type, value}, insights entities {id, type, weight}.
export function parseTag(raw: unknown): QTag | null {
  if (!isObj(raw)) return null;
  const id = str(raw.tag_id) ?? str(raw.id);
  if (!id || !id.startsWith("urn:tag:")) return null;
  const q = obj(raw.query);
  return {
    id,
    name: cleanTagName(str(raw.name) ?? tagLabel(id)) || tagLabel(id),
    namespace: namespaceFrom(raw.subtype) ?? namespaceFrom(raw.type) ?? tagNamespace(id),
    score: num(q.affinity) ?? num(q.score),
    popularity: num(raw.popularity),
  };
}

export function parseTagList(rows: unknown[]): QTag[] {
  const seen = new Set<string>();
  const out: QTag[] = [];
  for (const row of rows) {
    const t = parseTag(row);
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

export function parseTags(body: unknown): QTag[] {
  return parseTagList(resultRows(body, "tags"));
}
