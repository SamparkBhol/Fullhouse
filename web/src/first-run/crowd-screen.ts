import { plainName } from "../../../src/shared/words.ts";
import { h, replace } from "../dom.ts";
import { isCurrent, ticket } from "../router.ts";
import { title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { READ_STEPS, crowdCovers, crowdMap } from "./crowd.ts";
import { firstPath, planOf, readOf, type Run } from "./run.ts";

export function limitsLine(name: string): HTMLElement {
  return h("p", { class: "first-limits" }, `A pattern across many people who like ${name}, not a fact about any one of them.`);
}

export async function crowdScreen(run: Run, main: HTMLElement): Promise<void> {
  const venue = run.ctx.state.venue;
  const name = plainName(venue.entity.name);
  title(`Your crowd, ${name}`);
  const heading = h("h1", { class: "first-line", tabindex: "-1" }, run.ctx.state.read ? "Your crowd" : `Reading the crowd of ${name}`);
  const slot = h("div", { class: "crowd-slot" });
  replace(main, h("div", { class: "wrap wrap-wide first crowd" }, heading, slot));
  heading.focus({ preventScroll: true });
  if (!run.ctx.state.read) replace(slot, loading(`Asking Qloo about people who like ${name}`, READ_STEPS));
  const at = ticket();
  try {
    const read = await readOf(run);
    if (!isCurrent(at)) return;
    heading.textContent = "Your crowd";
    void planOf(run).catch(() => undefined);
    const next = h("a", { class: "button button-big button-lamp", href: firstPath(run.ctx.id, "match") }, "See your match");
    replace(
      slot,
      h(
        "div",
        { class: "crowd-grid" },
        crowdMap(read, venue),
        h("div", { class: "crowd-side" }, crowdCovers(read, name), h("p", { class: "actions first-next" }, next), limitsLine(name)),
      ),
    );
  } catch (err) {
    if (!isCurrent(at)) return;
    replace(slot, failure(err, () => void crowdScreen(run, main)));
  }
}
