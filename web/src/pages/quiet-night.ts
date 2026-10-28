import type { CreateVenueInput, QuietSlot, VenueCandidate } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { WEEKDAY_ORDER, weekdayName } from "../format.ts";
import { navigate } from "../router.ts";
import { rememberVenue, saveToken, tokenFromFragment } from "../store.ts";
import { field } from "../ui/field.ts";
import { focusHeading, page, title } from "../ui/shell.ts";
import { failure, loading } from "../ui/states.ts";

function zones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    return intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function slotStep(candidate: VenueCandidate, city: string): void {
  const main = page();
  const dayGroup = uid("day");
  const days = h(
    "fieldset",
    { class: "days" },
    h("legend", null, "Which night is quiet?"),
    h(
      "div",
      { class: "day-grid" },
      WEEKDAY_ORDER.map((d) => {
        const id = `${dayGroup}-${d}`;
        return h(
          "div",
          { class: "day" },
          h("input", { type: "radio", name: dayGroup, id, value: String(d), checked: d === 2 }),
          h("label", { for: id }, weekdayName(d)),
        );
      }),
    ),
  );
  const start = h("input", { type: "time", value: "19:00", required: true, step: "900" });
  const length = h(
    "select",
    null,
    [120, 180, 240, 300].map((m) => h("option", { value: String(m), selected: m === 180 }, `${m / 60} hours`)),
  );
  const capacity = h("input", { type: "number", min: "1", max: "2000", inputmode: "numeric", placeholder: "For example 40" });
  const here = deviceZone();
  const listed = zones();
  const tzList = listed.length && !listed.includes(here) ? [here, ...listed] : listed;
  const tz: HTMLInputElement | HTMLSelectElement = tzList.length
    ? h("select", null, tzList.map((z) => h("option", { value: z, selected: z === here }, z.replace(/_/g, " "))))
    : h("input", { type: "text", value: here });
  const email = h("input", { type: "email", autocomplete: "email", inputmode: "email" });
  const noLive = h("input", { type: "checkbox", id: uid("nolive") });
  const message = h("div", { "aria-live": "polite" });
  const form = h(
    "form",
    { class: "form", novalidate: true },
    days,
    h(
      "div",
      { class: "field-row" },
      field("Starts at", start),
      field("Length", length),
    ),
    field("How many people fit", capacity, "Optional. The plan keeps the night under this."),
    field("Time zone", tz, "Taken from this phone. Change it if the venue is somewhere else."),
    field("Your email", email, "Optional. Only used to send you the Monday draft. Never sent to Qloo."),
    h(
      "div",
      { class: "check" },
      noLive,
      h("label", { for: noLive.id }, h("strong", null, "No live music"), h("span", null, "Leave live acts out of every plan.")),
    ),
    h("p", { class: "actions" }, h("button", { class: "button button-big", type: "submit" }, "Create my venue")),
    message,
  );
  title("Your quiet night");
  replace(
    main,
    h(
      "div",
      { class: "wrap" },
      h("h1", null, "Your quiet night"),
      h(
        "div",
        { class: "picked" },
        h("p", { class: "picked-name" }, candidate.name),
        h("p", null, candidate.address || city),
        h("p", null, h("button", { class: "link-button", type: "button", onclick: () => navigate("/start", { replace: true }) }, "Not this one? Search again")),
      ),
      form,
    ),
  );
  focusHeading();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const dayInput = form.querySelector<HTMLInputElement>(`input[name="${dayGroup}"]:checked`);
    const errors: string[] = [];
    if (!dayInput) errors.push("Pick the quiet night.");
    if (!/^\d{2}:\d{2}$/.test(start.value)) errors.push("Set a start time.");
    const cap = capacity.value ? Number(capacity.value) : undefined;
    if (cap !== undefined && (!Number.isInteger(cap) || cap < 1)) errors.push("How many people fit should be a whole number.");
    if (email.value && !email.checkValidity()) errors.push("The email address does not look complete.");
    if (errors.length) {
      replace(message, h("div", { class: "form-error", role: "alert" }, errors.map((e) => h("p", null, e))));
      return;
    }
    const quietSlot: QuietSlot = {
      weekday: Number(dayInput?.value ?? 2) as QuietSlot["weekday"],
      start: start.value,
      durationMin: Number(length.value),
    };
    const input: CreateVenueInput = {
      candidate,
      city,
      tz: tz.value || here,
      quietSlot,
      ...(cap ? { capacity: cap } : {}),
      ...(email.value.trim() ? { ownerEmail: email.value.trim() } : {}),
      ...(noLive.checked ? { noLiveMusic: true } : {}),
    };
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (button) button.disabled = true;
    replace(message, loading(`Creating ${candidate.name}`));
    try {
      const created = await api.create(input);
      let ownerUrl = created.ownerUrl;
      let token = created.ownerToken;
      try {
        const parsed = new URL(created.ownerUrl, location.origin);
        token = tokenFromFragment(parsed.hash) ?? created.ownerToken;
        ownerUrl = parsed.href;
      } catch {
        ownerUrl = `${location.origin}/v/${encodeURIComponent(created.venue.id)}#token=${encodeURIComponent(token)}`;
      }
      saveToken(created.venue.id, token);
      rememberVenue({ id: created.venue.id, name: created.venue.entity.name, city: created.venue.city });
      createdStep(created.venue.id, created.venue.entity.name, ownerUrl);
    } catch (err) {
      if (button) button.disabled = false;
      replace(message, failure(err, () => form.requestSubmit()));
    }
  });
}

function createdStep(venueId: string, name: string, ownerUrl: string): void {
  title("Your owner link");
  const linkField = h("input", { type: "text", readonly: true, value: ownerUrl, class: "owner-link", id: uid("link") });
  const status = h("p", { class: "copy-status", role: "status" });
  const copy = h(
    "button",
    {
      class: "button",
      type: "button",
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(ownerUrl);
          status.textContent = "Copied. Paste it somewhere you will find it again.";
        } catch {
          linkField.focus();
          linkField.select();
          status.textContent = "Selected. Copy it with your phone's copy button.";
        }
      },
    },
    "Copy the link",
  );
  replace(
    page(),
    h(
      "div",
      { class: "wrap" },
      h("h1", null, `${name} is on Full House`),
      h(
        "section",
        { class: "owner-once", "aria-labelledby": "once-title" },
        h("h2", { id: "once-title" }, "Your owner link"),
        h(
          "p",
          null,
          "This link is the key to your venue. Anyone who has it can plan and publish nights for you. It is shown once, here. This phone remembers it, but save a copy in your notes or password manager for other devices.",
        ),
        h("div", { class: "field" }, h("label", { for: linkField.id }, "Owner link"), linkField),
        h("p", { class: "actions" }, copy),
        status,
      ),
      h("p", { class: "actions" }, h("a", { class: "button button-big", href: `/v/${encodeURIComponent(venueId)}` }, "Open my venue")),
    ),
  );
  focusHeading();
}
