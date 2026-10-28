import type { Rising, StreetRead, StreetTag, QlooType } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace, uid } from "../dom.ts";
import { TREND_WORDS, bearingWord, distance, metresBetween, moment, ordinal, prettyTag, walk } from "../format.ts";
import { rankCells } from "../heat.ts";
import { openReceipt, reasons } from "../ui/receipt.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { empty, failure, limitsLine, loading } from "../ui/states.ts";
import { refreshState, withVenue, type VenueCtx } from "../venue-context.ts";
import { READ_LINES } from "./venue.ts";

export function streetPage(id: string): Promise<void> {
  return withVenue(id, "street", (ctx, main) => {
    if (ctx.state.read) renderRead(ctx, main, ctx.state.read);
    else renderNoRead(ctx, main);
  });
}

function renderNoRead(ctx: VenueCtx, main: HTMLElement): void {
  title("The street");
  const slot = h("div", { "aria-live": "polite" });
  const button = h("button", { class: "button button-big", type: "button" }, "Read the street");
  button.addEventListener("click", () => void runRead(ctx, main, button, slot));
  replace(
    main,
    h(
      "div",
      { class: "wrap" },
      h("h1", null, "The street around you"),
      h("p", { class: "lede" }, "Full House has not read the street yet. It asks Qloo five things about the blocks around your venue:"),
      h("ul", { class: "ticks" }, READ_LINES.map((l) => h("li", null, l))),
      h("p", null, "Only your venue's public listing and its location are sent. Nothing about your customers."),
      h("p", { class: "actions" }, button),
      slot,
    ),
  );
  focusHeading();
}

async function runRead(ctx: VenueCtx, main: HTMLElement, button: HTMLButtonElement, slot: HTMLElement): Promise<void> {
  button.disabled = true;
  replace(slot, loading("Reading the street around your venue", READ_LINES));
  try {
    const read = await api.read(ctx.id, ctx.token);
    await refreshState(ctx).catch(() => undefined);
    renderRead(ctx, main, ctx.state.read ?? read);
  } catch (err) {
    button.disabled = false;
    replace(slot, failure(err, () => void runRead(ctx, main, button, slot)));
  }
}

const TYPE_HEADINGS: Record<QlooType, string> = {
  place: "Places",
  artist: "Artists",
  book: "Books",
  movie: "Films",
  tv_show: "TV shows",
  podcast: "Podcasts",
  videogame: "Video games",
  brand: "Brands",
  person: "People",
  destination: "Destinations",
};

function tagList(tags: StreetTag[], sharedIds: Set<string>, label: string, emptyText: string): HTMLElement {
  const id = uid("tags");
  if (!tags.length) return h("div", { class: "tag-col" }, h("h3", { id }, label), h("p", { class: "meta" }, emptyText));
  return h(
    "div",
    { class: "tag-col" },
    h("h3", { id }, label),
    h(
      "ol",
      { class: "ranked", "aria-labelledby": id },
      [...tags]
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 10)
        .map((t) => {
          const shared = sharedIds.has(t.id);
          return h(
            "li",
            { class: shared ? "shared" : "" },
            h("span", { class: "rank-no" }, String(t.rank)),
            h("span", { class: "rank-name" }, prettyTag(t.name)),
            shared ? h("span", { class: "shared-mark" }, h("span", { class: "sr-only" }, "in both lists")) : null,
          );
        }),
    ),
  );
}

const PICKS_SHOWN = 5;

// Qloo's weekly series held flat, so a trend is shown only when one actually moved.
function pickItem(r: Rising, read: StreetRead, tz: string): HTMLElement {
  return h(
    "li",
    { class: "pick" },
    h(
      "div",
      { class: "pick-head" },
      h("p", { class: "pick-name" }, r.name),
      r.trend !== "unknown" ? h("p", { class: `trend trend-${r.trend}` }, TREND_WORDS[r.trend]) : null,
    ),
    r.trendNote ? h("p", { class: "meta" }, `${r.trendNote}.`) : null,
    reasons(r.because, read.provenance, tz),
  );
}

function pickGroups(read: StreetRead, tz: string): HTMLElement[] {
  const types = [...new Set(read.rising.map((r) => r.type))];
  return types.map((type) => {
    const picks = read.rising.filter((r) => r.type === type).sort((a, b) => a.rank - b.rank);
    const id = uid("picks");
    const more = picks.slice(PICKS_SHOWN);
    return h(
      "div",
      { class: "pick-group" },
      h("h3", { id }, TYPE_HEADINGS[type] ?? type),
      h("ol", { class: "picks", "aria-labelledby": id }, picks.slice(0, PICKS_SHOWN).map((r) => pickItem(r, read, tz))),
      more.length
        ? h("details", { class: "more-picks" }, h("summary", null, `${more.length} more`), h("ol", { class: "picks", start: String(PICKS_SHOWN + 1) }, more.map((r) => pickItem(r, read, tz))))
        : null,
    );
  });
}

function renderRead(ctx: VenueCtx, main: HTMLElement, read: StreetRead): void {
  const tz = ctx.state.venue.tz;
  const venue = ctx.state.venue;
  title("The street");
  const sharedIds = new Set(read.shared.map((t) => t.id));
  const again = h("button", { class: "button button-quiet", type: "button" }, "Read again");
  const againSlot = h("div", { "aria-live": "polite" });
  again.addEventListener("click", () => void runRead(ctx, main, again, againSlot));

  const mapBox = h("div", { class: "map", role: "region", "aria-label": "Map of the street around your venue. The same information follows as a list." });
  const layerPicker = read.heat.length > 1 ? h("fieldset", { class: "layer-pick" }, h("legend", null, "Heat map of")) : null;
  const legend = h(
    "p",
    { class: "map-legend" },
    h("span", { class: "key key-strong", "aria-hidden": "true" }),
    "Darker squares are where the taste is strongest, ranked within this one layer. ",
    h("span", { class: "key key-none", "aria-hidden": "true" }),
    "Dashed squares: Qloo has no read there. Numbers are the loved places below.",
  );
  const cellList = h("ol", { class: "plain-list cell-list" });
  const fillCells = (index: number): void => {
    const layer = read.heat[index];
    if (!layer) {
      replace(cellList, h("li", null, "Qloo returned no heat map cells around your venue."));
      return;
    }
    const ranked = rankCells(layer.cells).filter((r) => r.order !== null).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!ranked.length) {
      replace(cellList, h("li", null, `Qloo returned no heat map cells with a read for ${layer.label}.`));
      return;
    }
    replace(
      cellList,
      ranked.slice(0, 5).map((r) => {
        const m = metresBetween(read.center.lat, read.center.lng, r.cell.lat, r.cell.lng);
        return h("li", null, `${ordinal(r.order ?? 0)} strongest: ${m < 60 ? "around your venue" : `${distance(m)} ${bearingWord(read.center.lat, read.center.lng, r.cell.lat, r.cell.lng)} of your venue`}`);
      }),
    );
  };

  const mapCol = h(
    "div",
    { class: "street-map" },
    h("h2", { class: "sr-only" }, "Map"),
    layerPicker,
    mapBox,
    legend,
    h(
      "details",
      { class: "map-text" },
      h("summary", null, "The map as a list"),
      h("h3", null, read.heat.length ? "Strongest squares" : "Heat map"),
      cellList,
      h("p", { class: "meta" }, `The circle on the map is ${distance(read.radiusM)} around ${venue.entity.name}.`),
    ),
  );

  const loved = read.lovedPlaces;
  const lovedSection = h(
    "section",
    { class: "block", "aria-labelledby": "loved-title" },
    h("h2", { id: "loved-title" }, "Places nearby your audience loves"),
    loved.length
      ? h(
          "ol",
          { class: "picks numbered" },
          loved.map((p, i) =>
            h(
              "li",
              { class: "pick" },
              h("span", { class: "pin-no", "aria-hidden": "true" }, String(i + 1)),
              h("div", { class: "pick-head" }, h("p", { class: "pick-name" }, p.name), h("p", { class: "pick-dist" }, distance(p.distanceM))),
              h("p", { class: "meta" }, [p.address, walk(p.distanceM)].filter(Boolean).join(", ")),
              p.tags.length ? h("p", { class: "pick-tags" }, p.tags.slice(0, 4).map(prettyTag).join(", ")) : null,
              reasons(p.because, read.provenance, tz),
            ),
          ),
        )
      : empty(`Qloo returned no places within ${distance(read.radiusM)} of your venue that your audience loves.`),
  );

  const evidence = h(
    "div",
    { class: "street-evidence" },
    h(
      "section",
      { class: "block", "aria-labelledby": "taste-title" },
      h("h2", { id: "taste-title" }, "What the street likes, and what you are liked for"),
      h("p", { class: "meta" }, "Taste tags from Qloo, ranked within each list. Marked tags are in both."),
      h(
        "div",
        { class: "tag-cols" },
        tagList(read.streetTags, sharedIds, "The street", "Qloo returned no taste tags for this street."),
        tagList(read.venueTags, sharedIds, venue.entity.name, "Qloo returned no taste tags for your venue."),
      ),
    ),
    h(
      "section",
      { class: "block", "aria-labelledby": "gap-title" },
      h("h2", { id: "gap-title" }, "What the street loves that you do not serve yet"),
      read.gaps.length
        ? h(
            "ul",
            { class: "picks" },
            read.gaps.map((g) =>
              h("li", { class: "pick" }, h("p", { class: "pick-name" }, prettyTag(g.tag.name)), h("p", null, g.note), reasons(g.because, read.provenance, tz)),
            ),
          )
        : empty("Qloo's comparison found nothing the loved places share that your venue lacks."),
    ),
    h(
      "section",
      { class: "block", "aria-labelledby": "picks-title" },
      h("h2", { id: "picks-title" }, `What people who like ${venue.entity.name} love`),
      h("p", { class: "meta" }, "Artists, books, films, shows and podcasts Qloo ties to your venue's audience, weighted to the area around it. Ranked within each list."),
      read.rising.length ? pickGroups(read, tz) : empty(`Qloo returned no artists, books, films, shows or podcasts for ${venue.entity.name}.`),
    ),
    lovedSection,
    read.demographics
      ? h(
          "section",
          { class: "block", "aria-labelledby": "demo-title" },
          h("h2", { id: "demo-title" }, "Who your audience is, in aggregate"),
          h("p", null, read.demographics.summary),
          reasons(
            [{ text: `Qloo demographics for people who like ${venue.entity.name}, in aggregate. It describes an audience, not any person.`, kind: "demographics", provenance: read.demographics.provenance }],
            read.provenance,
            tz,
          ),
        )
      : null,
    limitsLine(read.limits),
  );

  replace(
    main,
    h(
      "div",
      { class: "wrap wrap-wide" },
      h("h1", { class: "page-title" }, "The street around you"),
      h(
        "div",
        { class: "read-meta" },
        h("p", { class: "meta" }, `Read ${moment(read.at, tz)}, ${distance(read.radiusM)} around ${venue.entity.name}.`),
        h(
          "p",
          { class: "read-actions" },
          h(
            "button",
            { class: "button button-quiet", type: "button", onclick: () => openReceipt(read.provenance, null, { tz }) },
            `All ${read.provenance.length} Qloo calls`,
          ),
          again,
        ),
        againSlot,
      ),
      h("div", { class: "split split-map" }, mapCol, evidence),
    ),
  );
  focusHeading();

  void import("../ui/map.ts").then(({ drawStreetMap }) => {
    if (!mapBox.isConnected) return;
    const map = drawStreetMap(mapBox, { venue, center: read.center, radiusM: read.radiusM, heat: read.heat, loved });
    if (layerPicker) {
      const name = uid("layer");
      read.heat.forEach((layer, i) => {
        const id = `${name}-${i}`;
        const input = h("input", { type: "radio", name, id, value: String(i), checked: i === 0 });
        input.addEventListener("change", () => {
          map.showLayer(i);
          fillCells(i);
        });
        layerPicker.append(h("span", { class: "layer-opt" }, input, h("label", { for: id }, layer.label)));
      });
    }
  });
  fillCells(0);
}
