import type { Baseline, BaselineName } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { plural } from "../../../src/shared/words.ts";
import { VERIFY_WORDS, moment } from "../format.ts";
import { sessionGet, sessionSet } from "../store.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";
import { withVenue, type VenueCtx } from "../venue-context.ts";

export function proofPage(id: string): Promise<void> {
  return withVenue(id, "proof", (ctx, main) => renderProof(ctx, main));
}

// Distance only means something for places; a found artist, book or film is simply in Qloo's catalog.
function statusWord(n: BaselineName): string {
  if (n.kind === "place" || n.status !== "found_nearby") return VERIFY_WORDS[n.status] ?? n.status;
  return "In Qloo's catalog";
}

function countLine(names: BaselineName[]): string {
  if (!names.length) return "No names to check";
  const places = names.filter((n) => n.kind === "place");
  const others = names.filter((n) => n.kind !== "place");
  const parts: string[] = [];
  if (places.length) parts.push(`${places.filter((n) => n.status === "found_nearby").length} of ${plural(places.length, "place", "places")} found near you`);
  if (others.length) parts.push(`${others.filter((n) => n.status !== "not_found").length} of ${plural(others.length, "other name", "other names")} in Qloo's catalog`);
  return `${parts.join(". ")}.`;
}

// Whether a name exists is the easy part; the line that matters is whether Qloo ties it to this venue's audience.
function tiedCount(names: BaselineName[]): string {
  const checked = names.filter((n) => n.tied !== undefined);
  return `${checked.filter((n) => n.tied).length} of ${names.length}`;
}

function tiedLine(b: Baseline): HTMLElement {
  return h("p", { class: "proof-tied" }, `Tied to your audience by Qloo: plain model ${tiedCount(b.plainNames)}, Full House ${tiedCount(b.fullHouseNames)}.`);
}

function nameList(names: BaselineName[], label: string, id: string, sub?: string): HTMLElement {
  return h(
    "section",
    { class: "proof-col", "aria-labelledby": id },
    h("h3", { id }, label),
    sub ? h("p", { class: "proof-model" }, sub) : null,
    h("p", { class: "proof-count" }, countLine(names)),
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
              h("span", { class: "verify-status" }, statusWord(n)),
              n.note ? h("span", { class: "verify-note" }, n.note) : null,
              n.tieNote ? h("span", { class: n.tied ? "verify-note verify-tied" : "verify-note" }, n.tieNote) : null,
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
    tiedLine(b),
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
        "Full House asks a plain language model the question an owner would type into a chatbot, then looks up every place and artist it names on Qloo near you, and whether Qloo ties each one to the people who like your venue. It checks its own plan the same way.",
      ),
      h("p", { class: "meta" }, "Running the check uses a few Qloo calls and one model call."),
      h("p", { class: "actions" }, button),
      slot,
    ),
  );
  if (saved) replace(slot, renderResult(ctx, saved));
  focusHeading();
}
