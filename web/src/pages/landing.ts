import { h, replace } from "../dom.ts";
import { savedVenues, sessionGet, sessionSet } from "../store.ts";
import { focusHeading, page, plainFascia, title } from "../ui/shell.ts";
import { landingArt } from "./landing-art.ts";
import { shopFronts } from "./landing-front.ts";
import { liveStrip } from "./live-strip.ts";

function step(name: string, text: string): HTMLElement {
  return h("li", null, h("h3", null, name), h("p", null, text));
}

function landingFlyer(art: HTMLElement): HTMLElement {
  return h(
    "article",
    { class: "flyer flyer-landing flyer-taped" },
    h("span", { class: "tape tape-left", "aria-hidden": "true" }),
    h("span", { class: "tape tape-right", "aria-hidden": "true" }),
    h("p", { class: "flyer-when" }, h("span", null, "Every week"), h("span", null, "On your quiet night")),
    h("p", { class: "flyer-format" }, "For small venues with a slow night"),
    h("h1", { class: "flyer-title" }, "Fill your quiet night"),
    h(
      "p",
      { class: "flyer-sub" },
      "Full House asks Qloo what people who like your venue also love, then plans one night for your slowest evening and puts it out once you say yes.",
    ),
    art,
    h("p", { class: "flyer-where" }, "No customer data. Nothing goes out without you."),
  );
}

// The pavement board outside the shop: how it works, in three steps.
function aBoard(): HTMLElement {
  return h(
    "section",
    { class: "slate a-board", "aria-labelledby": "steps-title" },
    h("h2", { id: "steps-title", class: "slate-title" }, "How it works"),
    h(
      "ol",
      { class: "steps" },
      step("Find your venue", "Type its name and city. Full House finds it on Qloo and you pick the right one."),
      step("Read the street", "Qloo shows the artists, films and books your crowd is into, the places nearby it loves, and what those places offer that you do not."),
      step("Approve one night", "You get one night for your quiet slot with the reason for every pick. Approve it and Full House publishes the event, makes the poster and drafts notes to nearby places."),
    ),
    h("p", { class: "aside-link" }, h("a", { href: "/how" }, "Which Qloo calls it makes, and what it never sends")),
  );
}

export function landingPage(): void {
  plainFascia();
  title("Full House");
  const mine = savedVenues();
  const flash = sessionGet<string>("flash");
  if (flash) sessionSet("flash", null);
  const art = h("div", { class: "flyer-wall-slot", hidden: true });
  replace(
    page(),
    h(
      "div",
      { class: "landing" },
      flash ? h("p", { class: "notice landing-notice", role: "status" }, flash) : null,
      h("div", { class: "landing-street" }, shopFronts(landingFlyer(art))),
      h(
        "div",
        { class: "landing-side" },
        h("p", { class: "actions landing-cta" }, h("a", { class: "button button-big button-lamp", href: "/start" }, "Find your venue")),
        mine.length
          ? h(
              "section",
              { class: "landing-mine", "aria-labelledby": "mine-title" },
              h("h2", { id: "mine-title" }, "Your venues on this phone"),
              h(
                "ul",
                { class: "plain-list" },
                mine.map((v) => h("li", null, h("a", { class: "row-link", href: `/v/${encodeURIComponent(v.id)}` }, h("strong", null, v.name), h("span", null, v.city)))),
              ),
            )
          : null,
        liveStrip(),
        aBoard(),
      ),
    ),
  );
  landingArt(art);
  focusHeading();
}
