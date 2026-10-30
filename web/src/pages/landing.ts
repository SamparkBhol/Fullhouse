import { BACK_CHECKS, COUNT_SHOWN_FROM, EVENINGS, FIT_CHECKS, FIT_MAX, LOVED_TAKE, PICKS_PER_TYPE } from "../../../src/shared/engine.ts";
import { numberWord } from "../../../src/shared/words.ts";
import { h, replace } from "../dom.ts";
import { decisionBand, loadExample } from "../first-run/example.ts";
import { findForm, prefillFrom } from "../first-run/find.ts";
import { savedVenues, sessionGet, sessionSet } from "../store.ts";
import { focusHeading, page, publicHeader, title } from "../ui/shell.ts";

const STEPS: [string, string, string][] = [
  ["Read your crowd", "The places within a short walk that people who like you also love.", `Up to ${LOVED_TAKE} places, ranked`],
  ["Check it goes both ways", "The same question from each neighbour's side. A pair only works if their crowd loves you too.", `${BACK_CHECKS} reverse reads per match`],
  ["Rule out rivals", "Two cafes compete for the same people. A bookshop and a cinema send each other people.", `Up to ${FIT_MAX.partners} points for a good pair of kinds`],
  ["Find evenings you are both open", "Opening hours on both sides, so the night never lands on a day one of you is closed.", `The next ${numberWord(EVENINGS)} evenings`],
  ["Plan the night both crowds want", `Two stops, one at each place, built on a pick both crowds put in their top ${numberWord(PICKS_PER_TYPE)} and share about evenly.`, "The better known pick wins"],
];

function mine(): HTMLElement | null {
  const saved = savedVenues();
  if (!saved.length) return null;
  return h(
    "section",
    { class: "mine", "aria-labelledby": "mine-title" },
    h("h2", { id: "mine-title" }, "Your venues on this phone"),
    h(
      "ul",
      { class: "items" },
      saved.map((v) => h("li", null, h("a", { class: "item", href: `/v/${encodeURIComponent(v.id)}` }, h("span", { class: "item-name" }, v.name), h("span", { class: "item-end" }, v.city)))),
    ),
  );
}

function steps(): HTMLElement {
  return h(
    "section",
    { class: "band", id: "how", "aria-labelledby": "how-title" },
    h(
      "div",
      { class: "wrap" },
      h("h2", { id: "how-title" }, "How Full House picks your partner"),
      h("p", { class: "intro" }, `Taste data says what people like. Full House decides who you should work with, in these ${numberWord(STEPS.length)} steps, and shows you why with ${numberWord(FIT_CHECKS)} checks you can read.`),
      h("ol", { class: "steps" }, STEPS.map(([name, text, ours]) => h("li", null, h("h3", null, name), h("p", null, text), h("p", { class: "ours" }, ours)))),
    ),
  );
}

function twoLinks(): HTMLElement {
  const row = (side: "you" | "them", name: string, line: string): HTMLElement =>
    h("div", { class: `link-row link-${side}` }, h("i", { "aria-hidden": "true" }), h("div", null, h("b", null, name), h("span", { class: "link-url" }, line)), h("span", { class: "link-count" }, "counted"));
  return h(
    "section",
    { class: "band band-white", "aria-labelledby": "links-title" },
    h(
      "div",
      { class: "wrap" },
      h("h2", { id: "links-title" }, "Two links. One honest count."),
      h(
        "div",
        { class: "ledger-band" },
        h(
          "div",
          { class: "ledger-text" },
          h("p", null, "Every night gets a sign up link for each place. Full House records which link each guest came through, so you see the trade: ", h("strong", null, "who you sent, who they sent"), ", night after night. Your neighbour sees the count for its own link once it reaches ", String(COUNT_SHOWN_FROM), "."),
          h("p", null, "No taste data can tell you that. It is the record that makes the next yes easy."),
        ),
        h("div", { class: "links" }, row("you", "Your link", "For your regulars, on your page and your posts"), row("them", "Your neighbour's link", "For theirs, after they say yes")),
      ),
    ),
  );
}

function closing(): HTMLElement {
  return h(
    "section",
    { class: "band band-close", "aria-labelledby": "close-title" },
    h("div", { class: "wrap close" }, h("h2", { id: "close-title" }, "See which neighbour your crowd already loves."), h("p", { class: "actions" }, h("a", { class: "btn", href: "#find" }, "Find your neighbour"))),
  );
}

export function landingPage(): void {
  publicHeader({ find: true });
  title("Full House");
  const flash = sessionGet<string>("flash");
  if (flash) sessionSet("flash", null);
  const example = h("div", { class: "hero-pair", hidden: true });
  const hero = h(
    "section",
    { class: "hero hero-solo", id: "find" },
    h(
      "div",
      { class: "wrap" },
      h(
        "div",
        { class: "hero-copy" },
        flash ? h("p", { class: "notice", role: "status" }, flash) : null,
        h("h1", null, "Your best partner is already on your street."),
        h("p", { class: "lead" }, "Full House finds the place nearby whose customers love yours, checks that its customers love you back, and plans one night that walks each crowd through the other's door."),
        findForm(prefillFrom(location.search)),
        mine(),
      ),
      example,
    ),
  );
  const decides = decisionBand();
  replace(page(), hero, decides.el, steps(), twoLinks(), closing());
  loadExample(example, hero, decides.fill);
  focusHeading();
}
