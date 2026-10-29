import { h, replace } from "../dom.ts";
import { focusHeading, page, plainFascia, title } from "../ui/shell.ts";

const CALLS: [string, string, string][] = [
  ["Find your venue", "GET /search", "Your venue's name and city as one search. You pick the right match from the list, with its address."],
  ["The street's taste", "GET /v2/insights, tag mode", "Your venue's map point. Qloo answers with the taste tags the area around it carries."],
  ["Your audience's taste", "GET /v2/insights, tag mode", "Your venue's Qloo id. Qloo answers with the tags that describe the people who like your venue."],
  ["Places your audience loves", "GET /v2/insights, places", "Your venue's Qloo id and a 1.2 km circle around it. Qloo answers with nearby places people who like your venue also love, their opening hours, and whether it tied each one to your venue."],
  ["Two heat maps", "GET /v2/insights, heat map", "A 2 km circle, once with your venue as the signal and once with your venue's own kind of place, such as Book store or Cafe. Qloo answers with small map squares ranked by how strong that taste is in each."],
  ["Where you differ", "GET /v2/analysis/compare", "Your venue against up to five places your audience loves that host people, such as cafes, cinemas and shops. Tags you share are what you are already liked for. Tags two or more of them carry and you do not show up under Found nearby, not here."],
  ["Ideas for the night", "GET /v2/insights, artists, books, films, shows, podcasts", "Your venue's Qloo id, two places nearby your audience loves, and your map point, one call per kind. Qloo answers with what those audiences love, and for each pick how much of it came from your venue's crowd and how much from each place's."],
  ["Who your audience is", "GET /v2/insights, demographics", "Your venue's Qloo id. Qloo answers with how its audience leans by age and gender, in aggregate. It is never shown as a claim about a person."],
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
        h("p", null, "A street read makes 12 calls and never more than 30. Each answer is kept for a day, and every screen shows which call produced what. Qloo's weekly trend data for these picks held flat, so Full House shows no trend."),
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
        h("p", null, "On the Proof tab, the names a plain language model suggested go to Qloo search too, only to check whether they exist."),
        h("p", null, "A venue nobody opens for 8 weeks stops its Monday runs. After 6 months it is deleted with everything in it."),
        h("p", null, "Qloo's answers describe the taste of an area in aggregate. They are not claims about any person."),
      ),
      h(
        "section",
        { class: "block", "aria-labelledby": "model-title" },
        h("h2", { id: "model-title" }, "What the language model does"),
        h(
          "p",
          null,
          "The night is picked by plain rules from the Qloo answers: how high something ranks for your audience, whether it fits your venue, and whether that kind of night answers a gap the read found, such as cinemas nearby and none here. Partners have to be open that night by Qloo's hours. The model only writes the words: the event description, the poster lines, the social post and the note to partners.",
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
          "Before anything leaves Full House, one screen lists every action and the exact words: the event page, the poster, calendar entries, notes to partners and Eventbrite. You can change the words there. Notes to partners open in your own mail app, so you send them yourself. You can take a page down at any time. Every Monday the agent reads the street again, leaves out what you already ran, drafts the next night, and waits for you.",
        ),
      ),
      h(
        "section",
        { class: "block", "aria-labelledby": "music-title" },
        h("h2", { id: "music-title" }, "Music in your venue"),
        h(
          "p",
          null,
          "Playlists list artists your audience loves. A personal streaming account does not cover playing music to customers. Your venue needs its own public performance licence or a business music service.",
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
