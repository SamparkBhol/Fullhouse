import type { Baseline } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { screenHead } from "../first-run/crowd-screen.ts";
import { moment, readDate } from "../format.ts";
import { sessionGet, sessionSet } from "../store.ts";
import { modelName, printout } from "../ui/printout.ts";
import { credit, focusHeading, title } from "../ui/shell.ts";
import { sourcePart, sourcesDrawer } from "../ui/sources.ts";
import { OWN_PICKS_NOTE, countLine, failLine, heroLine, stampList } from "../ui/stamps.ts";
import { failure, loading } from "../ui/states.ts";
import { withVenue, type VenueCtx } from "../venue-context.ts";

export function proofPage(id: string): Promise<void> {
  return withVenue(id, "proof", (ctx, main) => renderProof(ctx, main));
}

// The method reads one sentence at a time; the sentence on what a miss does not prove is the page's limit.
function methodParts(method: string): { plain: string[]; limits: string[] } {
  const sentences = method.split(/(?<=\.)\s+(?=[A-Z])/).filter(Boolean);
  const limit = (t: string) => /not proof|does not know it|could not have grounded/i.test(t);
  return { plain: sentences.filter((t) => !limit(t)), limits: sentences.filter(limit) };
}

function result(ctx: VenueCtx, b: Baseline, again: HTMLElement): HTMLElement {
  const venue = ctx.state.venue.entity.name;
  const method = methodParts(b.method);
  const fails = failLine(b, venue);
  return h(
    "div",
    null,
    h("section", { class: "panel proof-hero" }, h("p", { class: "proof-line" }, heroLine(b, venue)), fails ? h("p", { class: "panel-lead" }, fails) : null, h("p", { class: "small" }, `Checked ${moment(b.at, ctx.state.venue.tz)}.`)),
    h(
      "section",
      { class: "panel section-grid", "aria-labelledby": "checked-title" },
      h("h2", { id: "checked-title" }, "What it named, checked"),
      h("p", null, `${countLine(b.plainNames, venue)} ${b.modelLabel ?? `${modelName(b.model)}, a small open model`}, asked with no taste data.`),
      b.plainNames.length ? stampList(b.plainNames, venue, b.plainText) : null,
      h("details", { class: "disclose more" }, h("summary", null, "Its whole answer"), h("div", { class: "printout" }, printout(b.plainText))),
    ),
    h("p", { class: "actions" }, again),
    sourcesDrawer({
      calls: [],
      limits: method.limits,
      parts: [
        sourcePart({ heading: "Full House's own picks", plain: [OWN_PICKS_NOTE], calls: [] }, b.fullHouseNames.length ? stampList(b.fullHouseNames, venue) : null),
        sourcePart({ heading: "The question", plain: [b.ask], calls: [] }),
        sourcePart({ heading: "How it was checked", plain: method.plain, calls: [] }),
      ],
    }),
  );
}

function renderProof(ctx: VenueCtx, main: HTMLElement): void {
  title("Proof");
  const key = `baseline.${ctx.id}`;
  const slot = h("div", { "aria-live": "polite" });
  const saved = sessionGet<Baseline>(key) ?? ctx.state.baseline ?? null;
  credit(saved ? `Names checked against Qloo, ${readDate(saved.at, ctx.state.venue.tz)}. Check by Full House.` : "Names checked against Qloo. Check by Full House.");
  const first = h("button", { class: "btn", type: "button" }, "Run the check");
  const again = h("button", { class: "btn btn-quiet", type: "button" }, "Run the check again");
  const intro = h("section", { class: "panel screen-one" }, h("p", null, "The check uses a few taste data calls and one model call."), h("p", { class: "actions actions-tight" }, first));
  const run = async (): Promise<void> => {
    first.disabled = true;
    again.disabled = true;
    replace(slot, loading("Asking a plain chatbot the same question", ["Taking every place and artist name from its answer", "Looking each name up near your venue", "Checking each one against what your crowd loves"]));
    try {
      const b = await api.baseline(ctx.id, ctx.token);
      sessionSet(key, b);
      intro.hidden = true;
      again.disabled = false;
      replace(slot, result(ctx, b, again));
    } catch (err) {
      first.disabled = false;
      again.disabled = false;
      replace(slot, failure(err, () => void run()));
    }
  };
  first.addEventListener("click", () => void run());
  again.addEventListener("click", () => void run());
  replace(
    main,
    h(
      "div",
      { class: "screen" },
      h(
        "div",
        { class: "wrap" },
        screenHead("Proof", "Full House asks a plain chatbot what an owner would ask it, then looks up every place and artist it names near you and checks whether your crowd loves it."),
        h("div", { class: "section-grid" }, intro, slot),
      ),
    ),
  );
  if (saved) {
    intro.hidden = true;
    replace(slot, result(ctx, saved, again));
  }
  focusHeading();
}
