import type { Baseline, BaselineName } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { VERIFY_WORDS, moment } from "../format.ts";
import { sessionGet, sessionSet } from "../store.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { withVenue, type VenueCtx } from "../venue-context.ts";

export function proofPage(id: string): Promise<void> {
  return withVenue(id, "proof", (ctx, main) => renderProof(ctx, main));
}

function nameList(names: BaselineName[], label: string, id: string, sub?: string): HTMLElement {
  const nearby = names.filter((n) => n.status === "found_nearby").length;
  return h(
    "section",
    { class: "proof-col", "aria-labelledby": id },
    h("h3", { id }, label),
    sub ? h("p", { class: "proof-model" }, sub) : null,
    h("p", { class: "proof-count" }, names.length ? `${nearby} of ${names.length} names found near you on Qloo` : "No names to check"),
    names.length
      ? h(
          "ul",
          { class: "verify-list" },
          names.map((n) =>
            h(
              "li",
              { class: `verify verify-${n.status}` },
              h("span", { class: "verify-mark", "aria-hidden": "true" }),
              h("span", { class: "verify-name" }, n.name),
              h("span", { class: "verify-status" }, VERIFY_WORDS[n.status] ?? n.status),
              n.note ? h("span", { class: "verify-note" }, n.note) : null,
            ),
          ),
        )
      : null,
  );
}

function renderResult(ctx: VenueCtx, b: Baseline): HTMLElement {
  return h(
    "div",
    { class: "proof-result" },
    h("p", { class: "meta" }, `Checked ${moment(b.at, ctx.state.venue.tz)}.`),
    h("h2", null, "The question"),
    h("p", { class: "quote" }, b.ask),
    h(
      "div",
      { class: "proof-cols" },
      nameList(b.plainNames, "A plain model", "plain-title", `Model ${b.model}, asked with no Qloo data`),
      nameList(b.fullHouseNames, "Full House", "fh-title"),
    ),
    h("h2", null, "How it was checked"),
    h("p", null, b.method),
    h("details", { class: "pitch" }, h("summary", null, "The plain model's full answer"), h("p", { class: "quote pre" }, b.plainText)),
  );
}

function renderProof(ctx: VenueCtx, main: HTMLElement): void {
  title("Proof");
  const key = `baseline.${ctx.id}`;
  const slot = h("div", { "aria-live": "polite" });
  const saved = sessionGet<Baseline>(key);
  const button = h("button", { class: "button button-big", type: "button" }, saved ? "Run the check again" : "Run the check");
  const run = async (): Promise<void> => {
    button.disabled = true;
    replace(slot, loading("Asking a plain model the same question", ["Taking every place and artist name from its answer", "Looking each name up on Qloo near your venue", "Doing the same for Full House's own picks"]));
    try {
      const b = await api.baseline(ctx.id, ctx.token);
      sessionSet(key, b);
      button.disabled = false;
      button.textContent = "Run the check again";
      replace(slot, renderResult(ctx, b));
    } catch (err) {
      button.disabled = false;
      replace(slot, failure(err, () => void run()));
    }
  };
  button.addEventListener("click", () => void run());
  replace(
    main,
    h(
      "div",
      { class: "wrap wrap-mid" },
      h("h1", null, "Proof"),
      h(
        "p",
        { class: "lede" },
        "Would a plain chatbot do the same job? Full House asks a plain language model to plan a night for your venue, then looks up every place and artist it names on Qloo near you. It does the same for its own plan.",
      ),
      h("p", { class: "meta" }, "Running the check uses a few Qloo calls and one model call."),
      h("p", { class: "actions" }, button),
      slot,
    ),
  );
  if (saved) replace(slot, renderResult(ctx, saved));
  focusHeading();
}
