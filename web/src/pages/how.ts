import type { FitKey } from "../../../src/shared/contract.ts";
import { BACK_CHECKS, FIT_LABELS, FIT_MAX, LOVED_RADIUS_M, LOVED_TAKE, PAIR_CANDIDATES, READ_CAP } from "../../../src/shared/engine.ts";
import { h, replace } from "../dom.ts";
import { credit, focusHeading, page, publicHeader, title } from "../ui/shell.ts";

const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const fitParts = (Object.keys(FIT_MAX) as FitKey[]).map((k) => `${FIT_LABELS[k].toLowerCase()} ${FIT_MAX[k]}`).join(", ");

const CALLS: [string, string, string][] = [
  ["Find your venue", "GET /search", "Your venue's name, searched round the centre of the city you picked, or within a mile of you when you use your location. Your position is used for that one search and never kept. Closed places are dropped and places that cannot host go last."],
  ["The street's taste", "GET /v2/insights, tag mode", "Your venue's map point. Qloo answers with the taste tags the area around it carries."],
  ["Your audience's taste", "GET /v2/insights, tag mode", "Your venue's Qloo id. Qloo answers with the tags that describe the people who like your venue."],
  ["Places your audience loves", "GET /v2/insights, places", `Your venue's Qloo id and a ${km(LOVED_RADIUS_M)} circle around it. Qloo answers with up to ${LOVED_TAKE} nearby places people who like your venue also love, with their opening hours.`],
  ["Do they love you back", "GET /v2/insights, places", `One call for each of the ${BACK_CHECKS} places that score best on the other checks, from the places your crowd loves that can host and do not sell what you sell, with that place as the signal, in the same circle. Full House looks for your venue in each answer, and the check passes only in the top half of that list.`],
  ["What the two of you share", "GET /v2/analysis/compare", "Your venue against the place with the best fit. What both carry joins the tags both places have; what only they carry shows under Found nearby, not here."],
  ["Where your crowd gathers", "GET /v2/insights, heat map", "Your venue as the signal, and your venue's own kind of place. Qloo answers with small map squares ranked by how strong that taste is in each."],
  ["What your crowd loves", "GET /v2/insights, artists, books, films, shows, podcasts", "Your venue's Qloo id and your map point, one call per kind."],
  ["The night for both crowds", "GET /v2/insights, the kinds the night needs", "Your venue and your match as the signal together, with explainability, so each pick shows how much of it came from each crowd."],
  ["The book behind the film", "GET /search, books", "Only for a book then film night: the title of each evenly shared film that Qloo files as based on a book, to find that book."],
];

const STEPS: [string, string[]][] = [
  ["Find your venue", ["Pick your city and type the name. You pick the right place from the list, with its address and neighbourhood."]],
  ["Read the street", ["Full House makes the calls listed below. Each answer is kept for a day, and every screen can show the call each part came from."]],
  [
    "Score the neighbours",
    [
      `Up to ${PAIR_CANDIDATES} places your crowd loves that can host a night and do not sell what you sell. Each gets a fit score out of 100 from six checks: ${fitParts}.`,
      "A bookshop and a cinema send each other people; two cafes compete for them. The place with the highest score is your match, the next two are the runners up, and every point is shown with the sentence behind it.",
    ],
  ],
  [
    "Plan the night from the pair",
    [
      "The two kinds of place decide the format: book then film, film then show, screening then drinks, book club then drinks, a listening party at a record shop, coffee or drinks then a live room's own set, show then drinks, a late view, or a TV and film quiz. A TV show only ever themes a quiz, a live room plays its own set and never a playlist, and the playlist plays only in a bar, a record shop or a cafe in the evening. What you say about your room, recorded music, a stage of your own, space for a spoken event, is obeyed.",
      "Every night has two stops with the walk between them, so both crowds walk into the other place. The day is your quiet day when both are open, or the nearest evening when both are.",
    ],
  ],
  [
    "Write the words",
    [
      "The model writes only the words: the event description, the poster lines, the social post and the note to your neighbour. A checker rejects any sentence that names a person, place, work or brand that is not in the brief. If the model fails or a name does not check out, fixed templates write the copy, and the plan says so.",
    ],
  ],
  [
    "Nothing goes out without both of you",
    [
      "Your neighbour gets an invite page, sets its own part of the night in its own words and at its own time, and answers yes or no. The night goes up only after that yes, and the public page says the yes came through an invite link. One screen lists every action and the exact words before anything leaves, and you can take a page down or change the words at any time.",
    ],
  ],
  ["Count the swap", ["Each place gets its own link to the event page. Every RSVP says whose link it came through, so you both see who sent whom."]],
  [
    "Every Monday",
    [
      "The agent reads the street again, leaves out what you already ran, drafts the next night, and waits for you.",
      "A venue nobody opens for 8 weeks stops its Monday runs. After 6 months it is deleted with everything in it.",
    ],
  ],
];

function stepsSection(): HTMLElement {
  return h(
    "section",
    { class: "section", "aria-labelledby": "steps-title" },
    h("h2", { id: "steps-title" }, "From your name to a night out"),
    h("ol", { class: "how-steps" }, STEPS.map(([name, lines]) => h("li", null, h("h3", null, name), lines.map((l) => h("p", null, l))))),
  );
}

function callsSection(): HTMLElement {
  return h(
    "section",
    { class: "section", "aria-labelledby": "calls-title" },
    h("div", { class: "section-head" }, h("h2", { id: "calls-title" }, "What Full House asks Qloo, in order"), h("p", { class: "meta" }, `A street read never makes more than ${READ_CAP} calls.`)),
    h("p", { class: "meta how-note" }, "Weekly trend data for these picks held flat, so Full House shows no trend."),
    h(
      "ol",
      { class: "calls panel" },
      CALLS.map(([name, endpoint, sent]) => h("li", null, h("h3", null, name), h("p", { class: "endpoint" }, endpoint), h("p", { class: "call-sent" }, sent))),
    ),
  );
}

function neverSection(): HTMLElement {
  return h(
    "div",
    { class: "screen-grid screen-grid-even section" },
    h(
      "section",
      { class: "panel", "aria-labelledby": "never-title" },
      h("h2", { id: "never-title" }, "What is never sent to Qloo"),
      h("p", null, "Nothing about your customers, because Full House never asks for it. Your email, the turnout you log and the RSVP counts stay with your venue. Qloo only receives your venue as a public place, its location, and public things like artists, books, films and places."),
      h("p", null, "On the Proof tab, the names a plain language model suggested are searched too, only to check whether they exist."),
      h("p", null, "The answers describe the taste of an area in aggregate. They are not claims about any person."),
    ),
    h(
      "section",
      { class: "panel", "aria-labelledby": "music-title" },
      h("h2", { id: "music-title" }, "Music in your venue"),
      h("p", null, "Playlists list artists your crowd loves. A personal streaming account does not cover playing music to customers. Your venue needs its own public performance licence or a business music service."),
    ),
  );
}

export function howPage(): void {
  publicHeader();
  title("How it works");
  credit("Taste data from Qloo. Map data from OpenStreetMap contributors. Matching, scores, plans and counts by Full House.");
  replace(
    page(),
    h(
      "div",
      { class: "screen" },
      h(
        "div",
        { class: "wrap" },
        h(
          "div",
          { class: "screen-head" },
          h("h1", null, "How Full House works"),
          h("p", null, "Full House finds the place down the street whose crowd already loves yours, plans one night that walks both crowds through both doors, and acts only after you and your neighbour say yes."),
          h("p", null, "The taste data comes from Qloo, a service that knows which places, books, films, shows, artists and podcasts the same people love. Everything built on it is Full House's own: which neighbour fits, the six checks and their points, the format, the day, the two stops, the invite and the count of who sent whom."),
          h("p", { class: "actions" }, h("a", { class: "btn", href: "/#find" }, "Find your neighbour")),
        ),
        stepsSection(),
        callsSection(),
        neverSection(),
      ),
    ),
  );
  focusHeading();
}

export function notFoundPage(): void {
  publicHeader();
  title("Not found");
  replace(
    page(),
    h(
      "div",
      { class: "screen" },
      h("div", { class: "wrap" }, h("div", { class: "screen-head" }, h("h1", null, "Nothing at this address"), h("p", null, "The link may be incomplete.")), h("p", { class: "actions" }, h("a", { class: "btn", href: "/" }, "Go to the start"))),
    ),
  );
  focusHeading();
}
