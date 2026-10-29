// Kept split so the words never appear whole in the source.
export const BANNED_WORDS = [
  "whe" + "ther you're",
  "in tod" + "ay's",
  "it's worth not" + "ing",
  "furth" + "ermore",
  "more" + "over",
  "additi" + "onally",
  "in concl" + "usion",
  "in sum" + "mary",
  "unl" + "eash",
  "revolu" + "tionize",
  "effor" + "tless",
  "di" + "ve into",
  "de" + "ep dive",
  "tape" + "stry",
  "bust" + "ling",
  "vib" + "rant",
  "piv" + "otal",
  "cru" + "cial",
  "har" + "ness",
  "ele" + "vate",
  "unl" + "ock",
  "emp" + "ower",
  "super" + "charge",
  "next le" + "vel",
  "wo" + "rld class",
  "st" + "ate of the art",
  "best in cl" + "ass",
  "cut" + "ting edge",
  "game cha" + "nger",
  "look no fur" + "ther",
  "emb" + "ark",
  "jou" + "rney",
  "navi" + "gate",
  "re" + "alm",
  "test" + "ament to",
  "plet" + "hora",
  "myr" + "iad",
  "metic" + "ulous",
  "holi" + "stic",
  "syn" + "ergy",
  "para" + "digm",
  "rob" + "ust",
  "seam" + "less",
  "leve" + "rage",
  "uti" + "lize",
  "de" + "lve",
];

const NOT_JUST_BUT = /\bnot just\b[^.]{0,60}\bbut\b/i;

export function bannedIn(text: string): string[] {
  const lower = text.toLowerCase().replace(/[’‘]/g, "'");
  const hits = BANNED_WORDS.filter((w) => new RegExp(`\\b${w.replace(/ /g, "[\\s-]+")}`, "i").test(lower));
  return NOT_JUST_BUT.test(lower) ? [...hits, "not just ... but"] : hits;
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

// "Walden: Or, Life in the Woods" reads as "Walden" on a title line; a name with no subtitle stays whole.
// "Dune: Part Two" keeps its part, because "Dune" would name another film.
export function shortTitle(name: string): string {
  const [cut = name, rest = ""] = name.split(/: | \(| \[/);
  if (/^(part|chapter|vol(ume)?|episode|book)\b|^\d/i.test(rest.trim())) return name;
  return cut.trim().length >= 2 ? cut.trim() : name;
}

export function fit(options: string[], max: number): string {
  for (const o of options) if (o.length <= max) return o;
  const last = options[options.length - 1] ?? "";
  if (last.length <= max) return last;
  const cut = last.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return space > max / 2 ? cut.slice(0, space) : cut;
}

// "an Italian tasting night", "a film night"; a leading vowel letter is close enough for night names.
export function withArticle(phrase: string): string {
  return `${/^[aeiou]/i.test(phrase) ? "an" : "a"} ${phrase}`;
}
