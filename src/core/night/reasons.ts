import type { Because, EntityRef, Match, PairNight, Rising, SharedPicks, Venue } from "../../shared/contract.ts";
import { TYPE_PLURAL, capFirst, listWords, ordinal, possessive, shortName } from "../../shared/words.ts";
import { shortTitle } from "../copy/text.ts";
import type { QuizRound } from "./activity.ts";
import type { Chosen } from "./picks.ts";
import type { PairCtx } from "./build.ts";

function known(r: Pick<Rising, "popularity">): number | null {
  return r.popularity === undefined ? null : Math.min(99, Math.floor(r.popularity * 100));
}

function plural(r: Pick<Rising, "type">): string {
  return r.type === "tv_show" ? "TV shows" : TYPE_PLURAL[r.type];
}

// One line a booker would say about a pick: how well known it is, and how evenly the two crowds go for it.
export function pickBecause(c: Chosen, venue: Venue, match: Match): Because[] {
  const first = c.pick.because[0];
  if (!first) return [];
  const name = shortTitle(c.pick.name);
  if (c.pick.filmOf) return [{ kind: first.kind, text: `${name}${c.pick.by ? ` by ${c.pick.by}` : ""} is the book the film is made from`, provenance: first.provenance }];
  const pct = known(c.pick);
  const fame = pct !== null ? `${name} is better known than ${pct} in 100 ${plural(c.pick)} on Qloo` : name;
  const v = shortName(venue.entity.name);
  const p = shortName(match.partner.name);
  if (!c.split) {
    const whose = c.side === "partner" ? `for ${possessive(p)} crowd` : c.side === "area" ? `among the ${plural(c.pick)} people around ${v} like` : `for ${possessive(v)} own crowd`;
    const own = `${fame}${pct !== null ? ", and it is" : " is"} ${ordinal(c.pick.rank)} ${whose}`;
    return [{ kind: first.kind, text: own, provenance: first.provenance }];
  }
  const even = `${pct !== null ? ", and it" : ""} pulls both crowds about evenly, ${c.split.venue} from ${v} to ${c.split.partner} from ${p}`;
  return [{ kind: "explainability", text: `${fame}${even}`, provenance: first.provenance }];
}

// A quiz round is one reason, not four: what the set is, and the floor it clears.
export function roundBecause(n: "one" | "two", r: QuizRound, chosen: Chosen[], venue: Venue): Because[] {
  const first = r.picks[0]?.because[0];
  if (!first) return [];
  const mine = chosen.filter((c) => r.picks.some((p) => p.id === c.pick.id));
  const pcts = r.picks.map(known).filter((x): x is number => x !== null);
  const offs = mine.flatMap((c) => (c.split ? [Math.abs(c.split.venue - 50)] : []));
  const kind = r.type === "tv_show" ? "TV" : TYPE_PLURAL[r.type];
  const whose = mine.every((c) => c.joint) ? "both crowds share" : `${possessive(shortName(venue.entity.name))} crowd knows`;
  const floor = pcts.length ? ` Each is better known than ${Math.min(...pcts)} in 100 ${plural(r.picks[0]!)} on Qloo` : "";
  const within = offs.length && offs.length === mine.length ? `splits the two crowds within ${Math.max(...offs)} point${Math.max(...offs) === 1 ? "" : "s"} of even` : "";
  const tail = floor && within ? `${floor}, and ${within}.` : floor ? `${floor}.` : within ? ` Each ${within}.` : "";
  return [{ kind: "explainability", text: `Round ${n} is the ${kind} ${whose}: ${listWords(r.picks.map((p) => shortTitle(p.name)))}.${tail}`, provenance: first.provenance }];
}

function fitBecause(match: Match, fallback: number): Because[] {
  return (match.fit?.checks ?? [])
    .filter((c) => c.pass && (c.key === "crowd" || c.key === "back" || c.key === "partners"))
    .map((c) => ({ kind: c.key === "partners" ? "tag" : "affinity", text: c.sentence.replace(/\.$/, ""), provenance: c.provenance ?? fallback }) as Because);
}

export function sharedPicksLine(p: SharedPicks | undefined): string | null {
  if (!p || p.names.length < 2) return null;
  return `Both crowds put ${listWords(p.names.map(shortTitle))} in their top ten ${p.type === "tv_show" ? "TV shows" : TYPE_PLURAL[p.type]}`;
}

export function nightReasons(pair: PairNight, pickReasons: Because[], playlist: EntityRef[], ctx: PairCtx, picks?: SharedPicks): Because[] {
  const { match } = ctx;
  const loved = match.provenance[0];
  if (loved === undefined) return pickReasons;
  const tags = match.shared.slice(0, 3).map((t) => t.name);
  const sharedRow = match.provenance[1] ?? loved;
  const titles = tags.length ? null : sharedPicksLine(picks);
  const firstPick = ctx.joint.find((r) => r.type === picks?.type)?.because[0];
  const artists = ctx.joint.find((r) => r.type === "artist")?.because[0];
  const at = pair.stops.filter((s) => (pair.playlistAt ?? []).includes(s.at)).map((s) => shortName(s.name));
  return [
    ...fitBecause(match, loved),
    { kind: "tag", text: `${capFirst(pair.label)}. ${pair.why}`, provenance: loved },
    ...pickReasons,
    ...(tags.length ? [{ kind: "compare", text: `Both places share ${listWords(tags)}`, provenance: sharedRow } as Because] : []),
    ...(titles ? [{ kind: "explainability", text: titles, provenance: firstPick?.provenance ?? loved } as Because] : []),
    ...(playlist.length && artists && at.length
      ? [{ ...artists, text: `The playlist at ${listWords(at)} is the ${playlist.length} artists both crowds like most, led by ${playlist[0]!.name}` }]
      : []),
  ];
}
