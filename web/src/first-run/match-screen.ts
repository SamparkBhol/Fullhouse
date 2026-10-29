import { plainName, possessive } from "../../../src/shared/words.ts";
import { h, replace } from "../dom.ts";
import type { Match } from "../joint.ts";
import { isCurrent, ticket } from "../router.ts";
import { title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { limitsLine } from "./crowd-screen.ts";
import { hoursFor, matchHead, partnerPhoto, runnerUp, sharedList } from "./match-view.ts";
import { firstPath, matchOf, planOf, swapPartner, type Run } from "./run.ts";

const FINDING = [
  "Places within a short walk that people who like you also love",
  "Keeping only places that can host a night",
  "Comparing what the two crowds share",
];

function noMatch(run: Run, main: HTMLElement, name: string): void {
  replace(
    main,
    h(
      "div",
      { class: "wrap first" },
      h("h1", { class: "first-line", tabindex: "-1" }, "No place nearby shares your crowd and can host a night"),
      h("p", { class: "first-say" }, `Qloo found no cafe, bar, cinema, bookshop, record shop, gallery or venue within a short walk that people who like ${name} also love. Full House can still plan a night at ${name} on its own.`),
      h("p", { class: "actions first-next" }, h("a", { class: "button button-big button-lamp", href: firstPath(run.ctx.id, "night") }, `Plan a night at ${name}`)),
    ),
  );
  main.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
}

function drawMatch(run: Run, main: HTMLElement, m: Match, name: string): void {
  const weekday = run.ctx.state.venue.quietSlot.weekday;
  const runners = h(
    "ul",
    { class: "runners" },
    m.runnersUp.slice(0, 2).map((p) =>
      runnerUp(p, (button) => {
        for (const b of runners.querySelectorAll("button")) b.disabled = true;
        button.querySelector(".runner-do")?.replaceChildren(`Swapping to ${plainName(p.name)}`);
        swapPartner(run, p.id)
          .then(() => matchScreen(run, main))
          .catch((err: unknown) => {
            for (const b of runners.querySelectorAll("button")) b.disabled = false;
            runners.after(failure(err));
          });
      }),
    ),
  );
  const heading = matchHead(m);
  heading.setAttribute("tabindex", "-1");
  replace(
    main,
    h(
      "div",
      { class: "wrap wrap-wide first match" },
      h(
        "div",
        { class: "match-grid" },
        heading,
        h("div", { class: "match-figure" }, partnerPhoto(m.partner)),
        h(
          "div",
          { class: "match-side" },
          h("p", { class: "match-hours" }, hoursFor(m.partner, weekday)),
          sharedList(m),
          h("p", { class: "actions first-next" }, h("a", { class: "button button-big button-lamp", href: firstPath(run.ctx.id, "night") }, "See the night both crowds want")),
          m.runnersUp.length
            ? h("section", { class: "match-runners", "aria-labelledby": "runners-title" }, h("h2", { id: "runners-title" }, "Or ask one of these"), runners)
            : null,
          limitsLine(name),
        ),
      ),
    ),
  );
  heading.focus({ preventScroll: true });
}

export async function matchScreen(run: Run, main: HTMLElement): Promise<void> {
  const name = plainName(run.ctx.state.venue.entity.name);
  title(`Your match, ${name}`);
  replace(main, h("div", { class: "wrap first" }, h("h1", { class: "first-line" }, "Your match"), loading(`Finding the place ${possessive(name)} crowd also loves`, FINDING)));
  const at = ticket();
  try {
    const m = await matchOf(run);
    if (!isCurrent(at)) return;
    if (!m) {
      noMatch(run, main, name);
      return;
    }
    void planOf(run).catch(() => undefined);
    drawMatch(run, main, m, name);
  } catch (err) {
    if (!isCurrent(at)) return;
    replace(main, h("div", { class: "wrap first" }, h("h1", { class: "first-line" }, "Your match"), failure(err, () => void matchScreen(run, main))));
  }
}
