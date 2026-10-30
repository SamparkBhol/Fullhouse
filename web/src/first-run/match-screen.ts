import type { StreetRead } from "../../../src/shared/contract.ts";
import { BACK_CHECKS, FIT_CHECKS } from "../../../src/shared/engine.ts";
import { numberWord, plainName, possessive, shortName } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { readDate } from "../format.ts";
import type { Match } from "../joint.ts";
import { isCurrent, ticket } from "../router.ts";
import { fitPanel, playOnce } from "../ui/fit.ts";
import { serverProgress, type ServerStep } from "../ui/progress.ts";
import { credit, title } from "../ui/shell.ts";
import { decisionPanel } from "../ui/decision.ts";
import { evidenceRow } from "../ui/evidence.ts";
import { callsLine } from "../ui/calls-line.ts";
import { failure } from "../ui/states.ts";
import { limitsLine, screenHead } from "./crowd-screen.ts";
import { matchLead, matchPair, runnerRow, verdictSub } from "./match-view.ts";
import { firstPath, matchOf, planOf, readOf, swapPartner, type Run } from "./run.ts";

const FINDING: ServerStep[] = [
  { label: "Places within a short walk that people who like you also love", call: /^loved_places$/ },
  { label: `Asking the ${BACK_CHECKS} that score best whether their crowd loves you back`, call: /^loves_back$/ },
  { label: "Comparing the best of them with you", call: /^compare$/ },
  { label: `Scoring each one on ${numberWord(FIT_CHECKS)} checks` },
];

function frame(main: HTMLElement, ...children: (HTMLElement | null)[]): void {
  replace(main, h("div", { class: "screen" }, h("div", { class: "wrap" }, ...children)));
}

function noMatch(run: Run, main: HTMLElement, name: string): void {
  frame(
    main,
    screenHead("No place nearby fits as a partner yet", `None of the cafes, bars, cinemas, bookshops, record shops or galleries within a short walk that people who like ${name} love can host a night with you. Full House can still plan a night at ${name} on its own.`),
    h("p", { class: "actions" }, h("a", { class: "btn", href: firstPath(run.ctx.id, "night") }, `Plan a night at ${name}`)),
  );
  main.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
}

function swapTo(run: Run, main: HTMLElement, status: HTMLElement): (partnerId: string, button: HTMLButtonElement) => void {
  return (partnerId, button) => {
    for (const b of main.querySelectorAll<HTMLButtonElement>("button")) b.disabled = true;
    button.textContent = "Swapping";
    swapPartner(run, partnerId)
      .then(() => matchScreen(run, main))
      .catch((err: unknown) => {
        for (const b of main.querySelectorAll<HTMLButtonElement>("button")) b.disabled = false;
        button.textContent = "Swap";
        replace(status, failure(err));
      });
  };
}

// Before the board existed a match carried only its runners up, so those keep their own panel.
function runnersPanel(m: Match, swap: (partnerId: string, button: HTMLButtonElement) => void, status: HTMLElement): HTMLElement | null {
  if (!m.runnersUp.length) return null;
  const runners = h("ul", { class: "items" }, m.runnersUp.slice(0, 2).map((p) => runnerRow(p, (button) => swap(p.id, button))));
  return h("section", { class: "panel", "aria-labelledby": "runners-title" }, h("h2", { id: "runners-title" }, "Or work with"), runners, status);
}

function drawMatch(run: Run, main: HTMLElement, m: Match, name: string, read: StreetRead | null): void {
  const venue = run.ctx.state.venue;
  const them = shortName(m.partner.name);
  const status = h("div", { "aria-live": "polite" });
  const swap = swapTo(run, main, status);
  const fit = m.fit ?? m.partner.fit;
  const scored = fit ? fitPanel(fit, verdictSub(m)) : null;
  const board = decisionPanel(m, { swap: (row, button) => swap(row.id, button) });
  credit(`Taste data from Qloo, read ${readDate(m.readAt, venue.tz)}. Scores by Full House.`);
  const actions = h(
    "p",
    { class: "actions part-actions" },
    h("a", { class: "btn", href: firstPath(run.ctx.id, "night") }, `Plan the night with ${them}`),
    scored ? h("a", { class: "btn btn-quiet", href: "#fit" }, "See how this was scored") : null,
  );
  const pair = matchPair(m, venue);
  pair.classList.add("part-pair");
  const evidence = evidenceRow(read, name);
  evidence?.classList.add("part-evidence");
  board?.classList.add("part-board");
  scored?.classList.add("part-fit");
  frame(
    main,
    screenHead(`${them} is your partner.`, matchLead(m, name)),
    h(
      "div",
      { class: "screen-grid partner-grid" },
      h("div", { class: "stack" }, pair, evidence, actions, scored, board ? status : runnersPanel(m, swap, status)),
      h("div", { class: "stack" }, board, callsLine(read, venue.tz)),
    ),
    limitsLine(name),
  );
  main.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  if (scored) playOnce(scored);
}

export async function matchScreen(run: Run, main: HTMLElement): Promise<void> {
  const name = plainName(run.ctx.state.venue.entity.name);
  title(`Your partner, ${name}`);
  const steps = serverProgress(`Finding the place ${possessive(name)} crowd also loves`, FINDING, () => api.progress(run.ctx.id, run.ctx.token));
  frame(main, screenHead("Your partner", `Full House scores the places your crowd loves on ${numberWord(FIT_CHECKS)} checks and picks the one that fits best.`), h("section", { class: "panel screen-one" }, steps.el));
  const at = ticket();
  try {
    const m = await matchOf(run);
    steps.finish();
    if (!isCurrent(at)) return;
    if (!m) {
      noMatch(run, main, name);
      return;
    }
    void planOf(run).catch(() => undefined);
    drawMatch(run, main, m, name, run.ctx.state.read ?? (await readOf(run).catch(() => null)));
  } catch (err) {
    if (!isCurrent(at)) return;
    frame(main, screenHead("Your partner", null), failure(err, () => void matchScreen(run, main)));
  }
}
