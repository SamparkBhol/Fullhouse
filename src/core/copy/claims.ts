import { MONTH_NAMES, WEEKDAY_NAMES } from "../planner/time.ts";

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/'s\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const GENERIC = new Set(
  [
    ...WEEKDAY_NAMES,
    ...MONTH_NAMES,
    "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun",
    "a", "an", "the", "and", "or", "but", "of", "on", "in", "at", "for", "to", "with", "by", "from", "into", "near",
    "our", "your", "you", "we", "us", "it", "its", "this", "that", "these", "those", "my", "me", "i", "hi", "hello", "dear",
    "night", "nights", "evening", "afternoon", "morning", "tonight", "today", "tomorrow", "weekly", "week", "next",
    "listening", "film", "films", "movie", "movies", "cinema", "screening", "quiz", "trivia", "book", "books", "reading",
    "club", "game", "games", "gaming", "podcast", "podcasts", "tasting", "pairing", "session", "sessions", "special",
    "records", "record", "vinyl", "music", "playlist", "menu", "food", "drinks", "drink", "wine", "beer", "coffee",
    "free", "entry", "rsvp", "doors", "open", "join", "come", "bring", "friends", "friend", "all", "welcome", "everyone",
    "live", "local", "neighbours", "neighbors", "street", "street's", "partner", "partners", "team", "owner", "owners",
    "cafe", "café", "bar", "pub", "shop", "bookshop", "gallery", "brewery", "venue", "room", "kitchen", "house",
    "qloo", "full", "pm", "am", "tv", "show", "shows", "dj", "q", "and", "plus", "new", "best", "first", "last",
    "thanks", "cheers", "regards", "hey", "see", "there", "here", "what", "why", "how", "when", "where", "who",
    "note", "please", "save", "date", "time", "ticket", "tickets", "chairs", "table", "tables", "seats", "seat",
    "if", "so", "no", "yes", "not", "be", "is", "are", "was", "will", "can", "let", "lets", "let's", "do", "go",
    "video", "theme", "themed", "fans", "fan", "picks", "pick", "taste", "tastes", "nearby", "around", "together",
    "would", "could", "should", "love", "like", "ask", "idea", "ideas", "cross", "promotion", "promote", "collab",
    "collaboration", "subject", "about", "re", "more", "info", "details", "sign", "up", "help", "hosting", "host",
    "city", "town", "downtown", "uptown", "centre", "center", "neighbourhood", "neighborhood", "block",
  ].map((w) => normalizeName(w)),
);

function isGenericPhrase(normalized: string): boolean {
  if (!normalized) return true;
  return normalized.split(" ").every((w) => GENERIC.has(w) || /^\d+$/.test(w));
}

const CONNECTORS = new Set(["of", "the", "and", "de", "la", "le", "du", "von", "van", "der", "del", "da", "di", "&", "y", "et"]);

function isCapitalised(word: string): boolean {
  return /^[\p{Lu}\p{Lt}][\p{L}\p{N}'’.-]*$/u.test(word);
}

interface Found {
  text: string;
  multi: boolean;
}

export function findNames(text: string): Found[] {
  const out: Found[] = [];
  const quoted = /["“”«»]([^"“”«»\n]{1,80})["“”«»]|(?:^|[\s(])‘([^’\n]{1,80})’/gu;
  let qm: RegExpExecArray | null;
  while ((qm = quoted.exec(text)) !== null) {
    const inner = (qm[1] ?? qm[2] ?? "").trim();
    if (/\p{L}/u.test(inner)) out.push({ text: inner, multi: true });
  }
  const sentences = text.split(/(?<=[.!?])\s+|\n+/u);
  for (const sentence of sentences) {
    const tokens = sentence.split(/\s+/).filter(Boolean);
    let run: string[] = [];
    let runStart = -1;
    const flush = () => {
      while (run.length && CONNECTORS.has(run[run.length - 1]?.toLowerCase() ?? "")) run.pop();
      if (run.length >= 2) out.push({ text: run.join(" "), multi: true });
      else if (run.length === 1 && runStart > 0) out.push({ text: run[0] ?? "", multi: false });
      run = [];
      runStart = -1;
    };
    tokens.forEach((raw, i) => {
      const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’.]+$/gu, "").replace(/[.]+$/, "");
      const breaksAfter = /[,()\[\]"“”:;!?]$/.test(raw);
      if (word && isCapitalised(word)) {
        if (runStart < 0) runStart = i;
        run.push(word);
      } else if (word && run.length && CONNECTORS.has(word.toLowerCase())) {
        run.push(word);
      } else {
        flush();
      }
      if (breaksAfter) flush();
    });
    flush();
  }
  return out;
}

export function checkClaims(text: string, allowedNames: string[]): { ok: boolean; unverified: string[] } {
  const allowed = allowedNames
    .filter((n) => typeof n === "string")
    .map(normalizeName)
    .filter((n) => n.length > 0)
    .sort((a, b) => b.length - a.length);
  const unverified: string[] = [];
  const seen = new Set<string>();
  for (const found of findNames(typeof text === "string" ? text : "")) {
    let rest = ` ${normalizeName(found.text)} `;
    if (!rest.trim()) continue;
    for (const a of allowed) {
      if (rest.includes(` ${a} `)) rest = rest.split(` ${a} `).join(" ");
    }
    rest = rest.trim().replace(/\s+/g, " ");
    if (isGenericPhrase(rest)) continue;
    if (allowed.some((a) => a.includes(rest) && rest.length >= 3)) continue;
    const key = normalizeName(found.text);
    if (seen.has(key)) continue;
    seen.add(key);
    unverified.push(found.text);
  }
  return { ok: unverified.length === 0, unverified };
}
