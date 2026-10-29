import { h, replace } from "../dom.ts";
import { loadExample } from "../first-run/example.ts";
import { findForm } from "../first-run/find.ts";
import { savedVenues, sessionGet, sessionSet } from "../store.ts";
import { focusHeading, page, plainFascia, title } from "../ui/shell.ts";

function mineList(): HTMLElement | null {
  const mine = savedVenues();
  if (!mine.length) return null;
  return h(
    "section",
    { class: "landing-mine", "aria-labelledby": "mine-title" },
    h("h2", { id: "mine-title" }, "Your venues on this phone"),
    h(
      "ul",
      { class: "plain-list" },
      mine.map((v) => h("li", null, h("a", { class: "row-link", href: `/v/${encodeURIComponent(v.id)}` }, h("strong", null, v.name), h("span", null, v.city)))),
    ),
  );
}

export function landingPage(): void {
  plainFascia();
  title("Full House");
  const flash = sessionGet<string>("flash");
  if (flash) sessionSet("flash", null);
  const example = h("div", { class: "landing-example", hidden: true });
  const form = findForm();
  replace(
    page(),
    h(
      "div",
      { class: "wrap wrap-wide landing" },
      flash ? h("p", { class: "notice landing-notice", role: "status" }, flash) : null,
      h(
        "div",
        { class: "landing-grid" },
        h("div", { class: "landing-find" }, h("h1", { class: "first-line" }, "Find the shop down the street that shares your customers."), form),
        example,
      ),
      mineList(),
    ),
  );
  loadExample(example);
  focusHeading();
}
