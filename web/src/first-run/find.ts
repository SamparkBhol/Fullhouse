import type { VenueCandidate } from "../../../src/shared/contract.ts";
import { CITIES, cityNamed } from "../../../src/shared/cities.ts";
import { capFirst, plainName } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { walk } from "../format.ts";
import { navigate } from "../router.ts";
import { rememberVenue, saveToken, sessionSet, tokenFromFragment } from "../store.ts";
import { describingTags } from "../tags.ts";
import { empty, failure } from "../ui/states.ts";
import { cityFromZone, venueDefaults } from "./defaults.ts";

const WAIT_MS = 450;
const OTHER = "other";

type Position = { lat: number; lng: number };

function pickRow(c: VenueCandidate, near: boolean, onPick: (button: HTMLButtonElement) => void): HTMLElement {
  const kind = c.kind ? capFirst(c.kind) : describingTags(c.tags, 1)[0];
  const button = h(
    "button",
    { type: "button", class: "find-pick" },
    h("span", { class: "find-name" }, plainName(c.name)),
    kind ? h("span", { class: "find-kind" }, kind) : null,
    h("span", { class: "find-address" }, c.address || "No street address listed"),
    near && c.distanceM !== undefined ? h("span", { class: "find-dist" }, walk(c.distanceM)) : null,
    c.neighborhood ? h("span", { class: "find-area" }, c.neighborhood) : null,
  );
  button.addEventListener("click", () => onPick(button));
  return h("li", null, button);
}

async function create(c: VenueCandidate, city: string, near?: Position): Promise<string> {
  const created = await api.create(venueDefaults(c, city, near));
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

function position(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("no geolocation"));
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject, { maximumAge: 60_000, timeout: 15_000 });
  });
}

// The venue's name with the city inside the same field. Matches come in as the owner types, and one tap sets the venue up.
export function findForm(): HTMLElement {
  const guess = cityFromZone();
  const listed = cityNamed(guess);
  const name = h("input", { type: "text", name: "name", autocomplete: "organization", maxlength: "120", spellcheck: "false", "aria-label": "Your venue", placeholder: "Your venue's name" });
  const select = h(
    "select",
    { name: "city", "aria-label": "City" },
    CITIES.map((c) => h("option", { value: c.name, selected: listed?.name === c.name }, c.name)),
    h("option", { value: OTHER, selected: !listed }, "Another city"),
  ) as HTMLSelectElement;
  const other = h("input", { type: "text", name: "other-city", "aria-label": "Your city", autocomplete: "address-level2", maxlength: "80", value: listed ? "" : guess, placeholder: "Type your city" });
  // The box is only in the page while Another city is chosen, so a listed city never shows an empty box.
  const otherLine = h("p", { class: "search-other" });
  const cityValue = (): string => (select.value === OTHER ? other.value.trim() : select.value);
  const showOther = (): void => (select.value === OTHER ? otherLine.replaceChildren(other) : otherLine.replaceChildren());
  showOther();
  const nearMe = h("button", { type: "button", class: "link-btn" }, "use my location");
  const altLine = h("p", { class: "search-alt" });
  const showAlt = (): void =>
    here
      ? altLine.replaceChildren("Searching within a mile of you. Pick a city to search by name instead.")
      : altLine.replaceChildren("Or ", nearMe, " to list places around you.");
  const results = h("div", { class: "finds-slot", "aria-live": "polite" });
  altLine.id = uid("alt");
  name.setAttribute("aria-describedby", altLine.id);
  let here: Position | null = null;
  showAlt();
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
      const id = await create(c, where, here ?? undefined);
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
    const where = here ? "" : cityValue();
    if (busy || n.length < 3) return;
    if (!where && !here) {
      replace(results, h("p", { class: "form-error", role: "alert" }, "Pick your city, or use your location."));
      return;
    }
    const mine = ++asked;
    results.classList.add("finds-busy");
    try {
      const found = await api.search(n, where, here ?? undefined);
      if (mine !== asked) return;
      const place = here ? "within a mile of you" : `in ${where}`;
      if (!found.length) {
        replace(results, empty(`Nothing called ${n} came back ${place}. Try the name as it is written on maps.`));
        return;
      }
      replace(results, h("ul", { class: "finds", "aria-label": `Places called ${n} ${place}` }, found.slice(0, 5).map((c) => pickRow(c, Boolean(here), (b) => void pick(c, b, where)))));
    } catch (err) {
      if (mine === asked) replace(results, failure(err, () => void search()));
    } finally {
      if (mine === asked) results.classList.remove("finds-busy");
    }
  };

  const soon = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void search(), WAIT_MS);
  };
  name.addEventListener("input", soon);
  select.addEventListener("change", () => {
    here = null;
    showAlt();
    showOther();
    if (select.value === OTHER) other.focus();
    soon();
  });
  other.addEventListener("input", soon);
  // The position is asked for on this tap only, sent with the search, and dropped when the city changes.
  nearMe.addEventListener("click", () => {
    nearMe.disabled = true;
    position()
      .then((p) => {
        here = p;
        otherLine.replaceChildren();
        showAlt();
        if (name.value.trim().length < 3) {
          replace(results, h("p", { class: "search-hint" }, "Now type what you are, such as cafe or bookshop, or your venue's name."));
          name.focus();
        } else void search();
      })
      .catch(() => replace(results, h("p", { class: "form-error", role: "alert" }, "Your phone did not share its location, so pick your city instead.")))
      .finally(() => {
        nearMe.disabled = false;
      });
  });
  const form = h(
    "form",
    { class: "search", role: "search", novalidate: true },
    h("div", { class: "field" }, name, select),
    h("button", { class: "btn", type: "submit" }, "Find my neighbour"),
    otherLine,
    results,
    altLine,
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void search();
  });
  return form;
}
