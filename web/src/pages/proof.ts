import type { Baseline } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { moment } from "../format.ts";
import { sessionGet, sessionSet } from "../store.ts";
import { receiptPart } from "../ui/fold.ts";
import { receiptsDrawer } from "../ui/receipts.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { modelName, printout } from "../ui/printout.ts";
import { OWN_PICKS_NOTE, countLine, failLine, heroLine, stampList } from "../ui/stamps.ts";
import { failure, loading } from "../ui/states.ts";
import { shopWindow } from "../ui/window.ts";
import { withVenue, type VenueCtx } from "../venue-context.ts";

export function proofPage(id: string): Promise<void> {
  return withVenue(id, "proof", (ctx, main) => renderProof(ctx, main));
}

function pinned(className: string, heading: string, ...body: (Node | null)[]): HTMLElement {
  return h("section", { class: `pinned ${className}` }, h("span", { class: "pin", "aria-hidden": "true" }), h("h3", { class: "pinned-title" }, heading), ...body);
}

// Two notes pinned to the frame: what the chatbot printed, and the same names with Qloo's stamp on each.
function notes(ctx: VenueCtx, b: Baseline): HTMLElement {
  const venue = ctx.state.venue.entity.name;
  return shopWindow(
    { size: "big", dark: true, lettering: `Checked on Qloo ${moment(b.at, ctx.state.venue.tz)}`, className: "proof-frame" },
    h(
      "div",
      { class: "proof-notes" },
      pinned(
        "printout",
        "What a plain chatbot said",
        h("p", { class: "printout-model" }, `${b.modelLabel ?? `${modelName(b.model)}, a small open model`}, asked with no Qloo data`),
        printout(b.plainText),
      ),
      pinned("checked", "The same names, checked on Qloo", h("p", { class: "checked-count" }, countLine(b.plainNames, venue)), b.plainNames.length ? stampList(b.plainNames, venue) : null),
    ),
  );
}

// The method reads one sentence at a time; the sentence on what a miss does not prove is the page's limit.
function methodParts(method: string): { plain: string[]; limits: string[] } {
  const sentences = method.split(/(?<=\.)\s+(?=[A-Z])/).filter(Boolean);
  const limit = (t: string) => /not proof|does not know it|could not have grounded/i.test(t);
  return { plain: sentences.filter((t) => !limit(t)), limits: sentences.filter(limit) };
}

function drawer(b: Baseline, venue: string): HTMLElement {
  const method = methodParts(b.method);
  return receiptsDrawer({
    calls: [],
    limits: method.limits,
    parts: [
      receiptPart({ heading: "Full House's own picks", plain: [OWN_PICKS_NOTE], calls: [] }, b.fullHouseNames.length ? stampList(b.fullHouseNames, venue) : null),
      receiptPart({ heading: "The question", plain: [b.ask], calls: [] }),
      receiptPart({ heading: "How it was checked", plain: method.plain, calls: [] }),
    ],
  });
}

function renderResult(ctx: VenueCtx, b: Baseline, again: HTMLElement): HTMLElement {
  const venue = ctx.state.venue.entity.name;
  return h(
    "div",
    { class: "proof-result" },
    h("p", { class: "proof-hero" }, heroLine(b, venue)),
    failLine(b, venue) ? h("p", { class: "proof-tied" }, failLine(b, venue)) : null,
    notes(ctx, b),
    h("p", { class: "actions proof-again" }, again),
    drawer(b, venue),
  );
}

function renderProof(ctx: VenueCtx, main: HTMLElement): void {
  title("Proof");
  const key = `baseline.${ctx.id}`;
  const slot = h("div", { "aria-live": "polite" });
  const saved = sessionGet<Baseline>(key) ?? ctx.state.baseline ?? null;
  const first = h("button", { class: "button button-big button-lamp", type: "button" }, "Run the check");
  const again = h("button", { class: "button button-quiet", type: "button" }, "Run the check again");
  const intro = h(
    "div",
    { class: "proof-intro" },
    h(
      "p",
      { class: "lede" },
      "Full House asks a plain chatbot what an owner would ask it, then looks up every place and artist it names on Qloo near you and checks whether your crowd loves it.",
    ),
    h("p", { class: "meta" }, "The check uses a few Qloo calls and one model call."),
    h("p", { class: "actions" }, first),
  );
  const run = async (): Promise<void> => {
    first.disabled = true;
    again.disabled = true;
    replace(slot, loading("Asking a plain chatbot the same question", ["Taking every place and artist name from its answer", "Looking each name up on Qloo near your venue", "Checking each one against what your crowd loves"]));
    try {
      const b = await api.baseline(ctx.id, ctx.token);
      sessionSet(key, b);
      intro.hidden = true;
      again.disabled = false;
      replace(slot, renderResult(ctx, b, again));
    } catch (err) {
      first.disabled = false;
      again.disabled = false;
      replace(slot, failure(err, () => void run()));
    }
  };
  first.addEventListener("click", () => void run());
  again.addEventListener("click", () => void run());
  replace(main, h("div", { class: "wrap wrap-wide proof" }, h("h1", { class: "proof-title" }, "Proof"), intro, slot));
  if (saved) {
    intro.hidden = true;
    replace(slot, renderResult(ctx, saved, again));
  }
  focusHeading();
}
