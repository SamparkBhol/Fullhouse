import { BACK_CHECKS } from "../../../src/shared/engine.ts";
import { plainName, possessive, shortName } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { readDate } from "../format.ts";
import type { Match } from "../joint.ts";
import { isCurrent, ticket } from "../router.ts";
import { fitPanel, playOnce } from "../ui/fit.ts";
import { serverProgress, type ServerStep } from "../ui/progress.ts";
import { credit, title } from "../ui/shell.ts";
import { failure } from "../ui/states.ts";
import { limitsLine, screenHead } from "./crowd-screen.ts";
import { matchLead, matchPair, runnerRow, verdictSub } from "./match-view.ts";
import { firstPath, matchOf, planOf, swapPartner, type Run } from "./run.ts";

const FINDING: ServerStep[] = [
  { label: "Places within a short walk that people who like you also love", call: /^loved_places$/ },
  { label: `Asking the ${BACK_CHECKS} that score best whether their crowd loves you back`, call: /^loves_back$/ },
  { label: "Comparing the best of them with you", call: /^compare$/ },
  { label: "Scoring each one on six checks" },
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

function drawMatch(run: Run, main: HTMLElement, m: Match, name: string): void {
  const venue = run.ctx.state.venue;
  const them = shortName(m.partner.name);
  const runners = h("ul", { class: "items" });
  const status = h("div", { "aria-live": "polite" });
  for (const p of m.runnersUp.slice(0, 2)) {
    runners.append(
      runnerRow(p, (button) => {
        for (const b of runners.querySelectorAll("button")) b.disabled = true;
        button.textContent = "Swapping";
        swapPartner(run, p.id)
          .then(() => matchScreen(run, main))
          .catch((err: unknown) => {
            for (const b of runners.querySelectorAll("button")) b.disabled = false;
            button.textContent = "Swap";
            replace(status, failure(err));
          });
      }),
    );
  }
  const fit = m.fit ?? m.partner.fit;
  const scored = fit ? fitPanel(fit, verdictSub(m)) : null;
  credit(`Taste data from Qloo, read ${readDate(m.readAt, venue.tz)}. Scores by Full House.`);
  frame(
    main,
    screenHead(`${them} is your partner.`, matchLead(m, name)),
    h(
      "div",
      { class: "screen-grid" },
      h(
        "div",
        { class: "stack" },
        matchPair(m, venue),
        h(
          "p",
          { class: "actions" },
          h("a", { class: "btn", href: firstPath(run.ctx.id, "night") }, `Plan the night with ${them}`),
          scored ? h("a", { class: "btn btn-quiet", href: "#fit" }, "See how this was scored") : null,
        ),
        m.runnersUp.length ? h("section", { class: "panel", "aria-labelledby": "runners-title" }, h("h2", { id: "runners-title" }, "Or work with"), runners, status) : null,
      ),
      h("div", null, scored),
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
  frame(main, screenHead("Your partner", `Full House scores the places your crowd loves on six checks and picks the one that fits best.`), h("section", { class: "panel screen-one" }, steps.el));
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
    drawMatch(run, main, m, name);
  } catch (err) {
    if (!isCurrent(at)) return;
    frame(main, screenHead("Your partner", null), failure(err, () => void matchScreen(run, main)));
  }
}
