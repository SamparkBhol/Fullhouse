import { h, replace } from "../dom.ts";
import { savedVenues, sessionGet, sessionSet } from "../store.ts";
import { focusHeading, page, plainFascia, title } from "../ui/shell.ts";

function step(name: string, text: string): HTMLElement {
  return h("li", null, h("h3", null, name), h("p", null, text));
}

export function landingPage(): void {
  plainFascia();
  title("Full House");
  const mine = savedVenues();
  const flash = sessionGet<string>("flash");
  if (flash) sessionSet("flash", null);
  replace(
    page(),
    h(
      "div",
      { class: "landing" },
      flash ? h("p", { class: "notice landing-notice", role: "status" }, flash) : null,
      h(
        "div",
        { class: "landing-hero" },
        h(
          "article",
          { class: "flyer flyer-landing" },
          h("p", { class: "flyer-when" }, h("span", null, "Every week"), h("span", null, "On your quiet night")),
          h("p", { class: "flyer-format" }, "For small venues with a slow night"),
          h("h1", { class: "flyer-title" }, "Fill your quiet night"),
          h(
            "p",
            { class: "flyer-sub" },
            "Full House reads what the street around your venue loves, plans one night for your slowest evening, and puts it out once you say yes.",
          ),
          h("p", { class: "flyer-where" }, "No customer data. Nothing goes out without you."),
        ),
        h("p", { class: "actions landing-cta" }, h("a", { class: "button button-big", href: "/start" }, "Find your venue")),
      ),
      h(
        "section",
        { class: "landing-steps", "aria-labelledby": "steps-title" },
        h("h2", { id: "steps-title" }, "How it works"),
        h(
          "ol",
          { class: "steps" },
          step("Find your venue", "Type its name and city. Full House finds it on Qloo and you pick the right one."),
          step(
            "Read the street",
            "Qloo shows what the blocks around you love, what nearby places your crowd loves offer that you do not, and the artists, films and books your crowd is into.",
          ),
          step(
            "Approve one night",
            "You get one night for your quiet slot with the reason for every pick. Approve it and Full House publishes the event, makes the poster and drafts notes to nearby places.",
          ),
        ),
        h("p", { class: "aside-link" }, h("a", { href: "/how" }, "Which Qloo calls it makes, and what it never sends")),
      ),
      mine.length
        ? h(
            "section",
            { class: "landing-mine", "aria-labelledby": "mine-title" },
            h("h2", { id: "mine-title" }, "Your venues on this phone"),
            h(
              "ul",
              { class: "plain-list" },
              mine.map((v) =>
                h(
                  "li",
                  null,
                  h("a", { class: "row-link", href: `/v/${encodeURIComponent(v.id)}` }, h("strong", null, v.name), h("span", null, v.city)),
                ),
              ),
            ),
          )
        : null,
    ),
  );
  focusHeading();
}
