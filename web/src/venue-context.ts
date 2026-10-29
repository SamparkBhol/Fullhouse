import type { Night, NightPlan, PlanResponse, VenueState } from "../../src/shared/contract.ts";
import { ApiFailure, api } from "./api.ts";
import { h, replace } from "./dom.ts";
import { isCurrent, ticket } from "./router.ts";
import { loadToken, rememberVenue, saveToken, sessionGet, sessionSet, tokenFromFragment } from "./store.ts";
import { focusHeading, page, plainFascia, title, venueFascia, type Tab } from "./ui/shell.ts";
import { failure, loading } from "./ui/states.ts";
import { todayIn } from "./format.ts";

export interface VenueCtx {
  id: string;
  token: string;
  state: VenueState;
}

const cache = new Map<string, VenueState>();

// A token in the link is only kept once the server accepts it, so a crafted link cannot replace a good one.
function tokenFromUrl(): string | null {
  const fromHash = tokenFromFragment(location.hash);
  if (fromHash) history.replaceState(null, "", location.pathname + location.search);
  return fromHash;
}

export function setState(id: string, state: VenueState): void {
  cache.set(id, state);
  rememberVenue({ id, name: state.venue.entity.name, city: state.venue.city });
}

export function liveNight(state: VenueState): Night | null {
  const today = todayIn(state.venue.tz);
  const upcoming = state.nights
    .filter((n) => n.status === "approved" && n.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] ?? null;
}

export function rememberPlanResponse(response: PlanResponse): void {
  const group = [response.plan, ...response.alternatives];
  for (const p of group) sessionSet(`plan.${p.id}`, { plan: p, alternatives: group.filter((o) => o.id !== p.id) });
}

export function planGroup(state: VenueState, planId: string): { plan: NightPlan | null; alternatives: NightPlan[] } {
  const remembered = sessionGet<PlanResponse>(`plan.${planId}`);
  const fromState = state.proposals.find((p) => p.id === planId) ?? null;
  const plan = fromState ?? remembered?.plan ?? null;
  if (!plan) return { plan: null, alternatives: [] };
  if (remembered && remembered.alternatives.length) {
    return { plan, alternatives: remembered.alternatives.filter((a) => a.id !== plan.id) };
  }
  const others = state.proposals.filter(
    (p) => p.id !== plan.id && p.status === "proposed" && p.date === plan.date && p.createdAt.slice(0, 16) === plan.createdAt.slice(0, 16),
  );
  return { plan, alternatives: others.slice(0, 2) };
}

function notSignedIn(main: HTMLElement): void {
  plainFascia();
  title("Owner link needed");
  replace(
    main,
    h(
      "div",
      { class: "wrap" },
      h("h1", null, "Open your owner link"),
      h(
        "p",
        null,
        "This phone does not hold the owner link for this venue. Open the link you saved when you created the venue. It signs this phone in and keeps it signed in.",
      ),
      h("p", { class: "actions" }, h("a", { class: "button button-quiet", href: "/start" }, "Set up a different venue")),
    ),
  );
  focusHeading();
}

export async function withVenue(
  id: string,
  tab: Tab | null,
  render: (ctx: VenueCtx, main: HTMLElement) => void | Promise<void>,
  opts: { fresh?: boolean } = {},
): Promise<void> {
  const main = page();
  const mine = ticket();
  const offered = tokenFromUrl();
  const saved = loadToken(id);
  const cached = cache.get(id);
  if (!offered && saved && cached && !opts.fresh) {
    venueFascia(cached.venue, tab, liveNight(cached));
    await render({ id, token: saved, state: cached }, main);
    return;
  }
  if (!offered && !saved) {
    notSignedIn(main);
    return;
  }
  replace(main, h("div", { class: "wrap" }, loading("Opening your venue")));
  const open = async (token: string): Promise<VenueState> => {
    const state = await api.state(id, token);
    if (token !== saved) saveToken(id, token);
    return state;
  };
  const run = async (): Promise<void> => {
    try {
      let token = offered ?? saved ?? "";
      let state: VenueState;
      try {
        state = await open(token);
      } catch (err) {
        if (!(err instanceof ApiFailure && err.status === 401 && offered && saved && saved !== offered)) throw err;
        token = saved;
        state = await open(token);
      }
      if (!isCurrent(mine)) return;
      setState(id, state);
      venueFascia(state.venue, tab, liveNight(state));
      await render({ id, token, state }, main);
    } catch (err) {
      if (!isCurrent(mine)) return;
      if (err instanceof ApiFailure && err.status === 401 && !saved) {
        notSignedIn(main);
        return;
      }
      replace(main, h("div", { class: "wrap" }, h("h1", { class: "sr-only" }, "Venue"), failure(err, () => void run())));
    }
  };
  await run();
}

export async function refreshState(ctx: VenueCtx): Promise<VenueState> {
  const state = await api.state(ctx.id, ctx.token);
  setState(ctx.id, state);
  ctx.state = state;
  return state;
}
