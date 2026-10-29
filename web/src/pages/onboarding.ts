import type { VenueCandidate } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { describingTags } from "../tags.ts";
import { field } from "../ui/field.ts";
import { focusHeading, page, plainFascia, title } from "../ui/shell.ts";
import { empty, failure, loading } from "../ui/states.ts";
import { slotStep } from "./quiet-night.ts";

function candidateTags(c: VenueCandidate): HTMLElement | null {
  const words = describingTags(c.tags, 3);
  return words.length ? h("span", { class: "candidate-tags" }, words.join(", ")) : null;
}

export function onboardingPage(): void {
  plainFascia();
  title("Find your venue");
  const main = page();
  const nameInput = h("input", { type: "text", name: "name", required: true, autocomplete: "organization", maxlength: "120" });
  const cityInput = h("input", { type: "text", name: "city", required: true, autocomplete: "address-level2", maxlength: "80" });
  const results = h("div", { class: "results", "aria-live": "polite" });
  const form = h(
    "form",
    { class: "form", novalidate: true },
    field("Venue name", nameInput, "As it appears on your sign or on maps."),
    field("City", cityInput),
    h("p", { class: "actions" }, h("button", { class: "button button-big", type: "submit" }, "Look it up")),
  );
  replace(
    main,
    h(
      "div",
      { class: "wrap" },
      h("h1", null, "Find your venue"),
      h("p", { class: "lede" }, "Full House looks your venue up on Qloo as a public place. You pick the right match, then tell it which night is quiet."),
      form,
      results,
    ),
  );
  focusHeading();

  const search = async (): Promise<void> => {
    const name = nameInput.value.trim();
    const city = cityInput.value.trim();
    if (!name || !city) {
      replace(results, h("p", { class: "form-error", role: "alert" }, "Type both the venue name and the city."));
      (name ? cityInput : nameInput).focus();
      return;
    }
    replace(results, loading(`Looking up ${name} in ${city} on Qloo`));
    try {
      const candidates = await api.search(name, city);
      if (!candidates.length) {
        replace(
          results,
          empty(
            `Qloo has no place called ${name} in ${city}. Check the spelling, or try the name exactly as it appears on maps.`,
          ),
        );
        return;
      }
      showCandidates(results, candidates, city);
    } catch (err) {
      replace(results, failure(err, () => void search()));
    }
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void search();
  });
}

function showCandidates(results: HTMLElement, candidates: VenueCandidate[], city: string): void {
  const groupName = uid("cand");
  const list = h(
    "fieldset",
    { class: "candidates" },
    h("legend", null, candidates.length === 1 ? "Qloo found one place. Is this yours?" : `Qloo found ${candidates.length} places. Which one is yours?`),
    candidates.map((c, i) => {
      const id = `${groupName}-${i}`;
      return h(
        "div",
        { class: "candidate" },
        h("input", { type: "radio", name: groupName, id, value: String(i), required: true }),
        h(
          "label",
          { for: id },
          h("strong", null, c.name),
          h("span", { class: "candidate-address" }, c.address || "Qloo has no street address for this place"),
          candidateTags(c),
        ),
      );
    }),
  );
  const pickForm = h(
    "form",
    { class: "form" },
    list,
    h("p", { class: "actions" }, h("button", { class: "button button-big", type: "submit" }, "This is my venue")),
  );
  replace(results, pickForm);
  pickForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const chosen = pickForm.querySelector<HTMLInputElement>(`input[name="${groupName}"]:checked`);
    const picked = chosen ? candidates[Number(chosen.value)] : undefined;
    if (!picked) {
      const existing = pickForm.querySelector(".form-error");
      if (!existing) list.after(h("p", { class: "form-error", role: "alert" }, "Pick the place that is yours."));
      return;
    }
    void slotStep(picked, city);
  });
}
