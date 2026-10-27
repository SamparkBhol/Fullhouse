import { h, replace } from "../dom.ts";
import { focusHeading, page, plainFascia, title } from "../ui/shell.ts";

const CALLS: [string, string, string][] = [
  ["Find your venue", "GET /search", "Your venue's name, the place type and your city. You pick the right match from the list."],
  ["The street's taste", "GET /v2/insights, tag mode", "Your venue's map point and a radius. Qloo answers with the taste tags the area leans toward."],
  ["Your venue's taste", "GET /v2/insights, tag mode", "Your venue's Qloo id. Qloo answers with the tags that describe the audience of places like yours."],
  ["Places the street loves", "GET /v2/insights, places", "Your map point and about 1.2 km. Qloo answers with nearby places and why each one ranks."],
  ["The heat map", "GET /v2/insights, heat map", "The area around you and the street's top tags. Qloo answers with small map squares ranked by how strong that taste is in each."],
  ["Where you differ", "GET /v2/analysis/compare", "Your venue against the top loved places. Shared tags are what the street already likes you for. The rest is the gap."],
  ["Ideas for the night", "GET /v2/insights, artists, books, films, shows, podcasts, games", "Your map point. Qloo answers with what the street leans toward in each, with reasons."],
  ["What is rising", "GET /v2/trending", "A short list of those ideas and the last eight weeks. Qloo answers with how each one's popularity is moving."],
  ["Age and gender lean", "GET /v2/insights, demographics", "Your map point. Qloo answers with how the area's taste leans by age and gender, in aggregate. It is shown as a lean of the street, never as a claim about a person."],
];

export function howPage(): void {
  plainFascia();
  title("How it works");
  replace(
    page(),
    h(
      "div",
      { class: "wrap wrap-mid" },
      h("h1", null, "How Full House works"),
      h(
        "p",
        { class: "lede" },
        "Full House is an agent for one venue. It reads the street from Qloo, plans one night for your quiet slot, and acts only after you approve.",
      ),
      h(
        "section",
        { class: "block", "aria-labelledby": "calls-title" },
        h("h2", { id: "calls-title" }, "The Qloo calls, in order"),
        h("p", null, "A full street read makes up to 30 calls. Each answer is kept for a day, and every screen shows which call produced what."),
        h(
          "ol",
          { class: "calls" },
          CALLS.map(([name, endpoint, sent]) => h("li", null, h("h3", null, name), h("p", { class: "endpoint" }, endpoint), h("p", null, sent))),
        ),
      ),
      h(
        "section",
        { class: "block", "aria-labelledby": "never-title" },
        h("h2", { id: "never-title" }, "What is never sent to Qloo"),
        h(
          "p",
          null,
          "Nothing about your customers, because Full House never asks for it. Your email, the turnout you log and the RSVP counts stay with your venue. Qloo only receives your venue as a public place, its location, and public things like artists, books, films and places.",
        ),
        h("p", null, "Qloo's answers describe the taste of an area in aggregate. They are not claims about any person."),
      ),
      h(
        "section",
        { class: "block", "aria-labelledby": "model-title" },
        h("h2", { id: "model-title" }, "What the language model does"),
        h(
          "p",
          null,
          "The night is picked by plain rules from the Qloo answers: how high something ranks on your street, whether it is rising, whether it fits your venue and fills a gap. The model only writes the words: the event description, the poster lines, the social post and the note to partners.",
        ),
        h(
          "p",
          null,
          "A checker rejects any sentence that names a person, place, work or brand that is not in the Qloo brief. If the model fails or a name does not check out, fixed templates write the copy instead, and the plan says so.",
        ),
      ),
      h(
        "section",
        { class: "block", "aria-labelledby": "approve-title" },
        h("h2", { id: "approve-title" }, "Nothing goes out without you"),
        h(
          "p",
          null,
          "Before anything leaves Full House, one screen lists every action: the event page, the poster, calendar entries, notes to partners and Eventbrite. Notes to partners open in your own mail app, so you send them yourself. Every Monday the agent reads the street again and drafts the next night, and it waits for you.",
        ),
      ),
      h(
        "section",
        { class: "block", "aria-labelledby": "music-title" },
        h("h2", { id: "music-title" }, "Music in your venue"),
        h(
          "p",
          null,
          "Playlists list artists the street leans toward. A personal streaming account does not cover playing music to customers. Your venue needs its own public performance licence or a business music service.",
        ),
      ),
      h("p", { class: "actions" }, h("a", { class: "button button-big", href: "/start" }, "Find your venue")),
    ),
  );
  focusHeading();
}

export function notFoundPage(): void {
  plainFascia();
  title("Not found");
  replace(
    page(),
    h(
      "div",
      { class: "wrap" },
      h("h1", null, "Nothing at this address"),
      h("p", null, "The link may be incomplete."),
      h("p", { class: "actions" }, h("a", { class: "button", href: "/" }, "Go to the start")),
    ),
  );
  focusHeading();
}
