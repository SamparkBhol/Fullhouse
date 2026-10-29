import type { VenueCandidate } from "../../../src/shared/contract.ts";
import { plainName } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { navigate } from "../router.ts";
import { rememberVenue, saveToken, sessionSet, tokenFromFragment } from "../store.ts";
import { describingTags } from "../tags.ts";
import { empty, failure } from "../ui/states.ts";
import { cityFromZone, venueDefaults } from "./defaults.ts";

const WAIT_MS = 450;

function sizeTo(input: HTMLInputElement, floor: number): void {
  input.size = Math.max(floor, input.value.length + 1);
}

function pickRow(c: VenueCandidate, onPick: (button: HTMLButtonElement) => void): HTMLElement {
  const kind = describingTags(c.tags, 3);
  const button = h(
    "button",
    { type: "button", class: "find-pick" },
    h("strong", { class: "find-name" }, plainName(c.name)),
    h("span", { class: "find-address" }, c.address || "Qloo has no street address for this place"),
    kind.length ? h("span", { class: "find-kind" }, kind.join(", ")) : null,
  );
  button.addEventListener("click", () => onPick(button));
  return h("li", null, button);
}

async function create(c: VenueCandidate, city: string): Promise<string> {
  const created = await api.create(venueDefaults(c, city));
  let token = created.ownerToken;
  try {
    token = tokenFromFragment(new URL(created.ownerUrl, location.origin).hash) ?? token;
  } catch {
    // The token in the body is the same one.
  }
  saveToken(created.venue.id, token);
  rememberVenue({ id: created.venue.id, name: created.venue.entity.name, city: created.venue.city });
  sessionSet(`owner.${created.venue.id}`, created.ownerUrl);
  return created.venue.id;
}

// One field and a city chip. Matches come in as the owner types, and one tap on a match sets the venue up.
export function findForm(): HTMLElement {
  const nameId = uid("find");
  const name = h("input", { type: "text", id: nameId, name: "name", autocomplete: "organization", maxlength: "120", spellcheck: "false", "aria-describedby": `${nameId}-hint`, class: "find-input" });
  const city = h("input", { type: "text", name: "city", "aria-label": "City", autocomplete: "address-level2", maxlength: "80", class: "city-chip", value: cityFromZone(), placeholder: "your city" });
  const results = h("div", { class: "find-results", "aria-live": "polite" });
  const hint = h("p", { class: "find-hint", id: `${nameId}-hint` }, "Matches from Qloo show as you type. Tap yours.");
  sizeTo(city, 8);
  let timer = 0;
  let asked = 0;
  let busy = false;

  const pick = async (c: VenueCandidate, button: HTMLButtonElement, where: string): Promise<void> => {
    if (busy) return;
    busy = true;
    for (const b of results.querySelectorAll("button")) b.disabled = true;
    button.classList.add("find-picked");
    button.append(h("span", { class: "find-going", role: "status" }, `Setting up ${plainName(c.name)} and reading its crowd`));
    try {
      const id = await create(c, where);
      navigate(`/v/${encodeURIComponent(id)}/first`);
    } catch (err) {
      busy = false;
      results.append(failure(err, () => void pick(c, button, where)));
      for (const b of results.querySelectorAll("button")) b.disabled = false;
    }
  };

  const search = async (): Promise<void> => {
    window.clearTimeout(timer);
    const n = name.value.trim();
    const where = city.value.trim();
    if (busy || n.length < 3) return;
    if (!where) {
      replace(results, h("p", { class: "form-error", role: "alert" }, "Add your city in the chip after the name."));
      return;
    }
    const mine = ++asked;
    results.classList.add("find-busy");
    try {
      const found = await api.search(n, where);
      if (mine !== asked) return;
      if (!found.length) {
        replace(results, empty(`Qloo has no place called ${n} in ${where}. Try the name as it is on maps.`));
        return;
      }
      replace(results, h("ul", { class: "finds", "aria-label": `Places called ${n} in ${where}` }, found.slice(0, 5).map((c) => pickRow(c, (b) => void pick(c, b, where)))));
    } catch (err) {
      if (mine === asked) replace(results, failure(err, () => void search()));
    } finally {
      if (mine === asked) results.classList.remove("find-busy");
    }
  };

  const soon = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void search(), WAIT_MS);
  };
  name.addEventListener("input", soon);
  city.addEventListener("input", () => {
    sizeTo(city, 8);
    soon();
  });
  const form = h(
    "form",
    { class: "find", role: "search", novalidate: true },
    h("label", { class: "find-label", for: nameId }, "Your venue"),
    name,
    h("p", { class: "find-city" }, h("span", { "aria-hidden": "true" }, "in "), city),
    hint,
    results,
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void search();
  });
  return form;
}
