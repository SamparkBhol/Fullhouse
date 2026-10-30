import { BACK_CHECKS } from "../../../src/shared/engine.ts";
import { plainName } from "../../../src/shared/words.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";
import { isCurrent, navigate, ticket } from "../router.ts";
import { warmImages } from "../ui/cover.ts";
import { serverProgress, type ServerStep } from "../ui/progress.ts";
import { readingMap } from "../ui/reading-map.ts";
import { roomForm } from "../ui/room-form.ts";
import { credit, title } from "../ui/shell.ts";
import { failure } from "../ui/states.ts";
import { screenHead } from "./crowd-screen.ts";
import { firstPath, readOf, type Run } from "./run.ts";

export const READ_STEPS: ServerStep[] = [
  { label: "Getting the places near you that your crowd loves", call: /^loved_places$/ },
  { label: `Asking the ${BACK_CHECKS} best whether their crowd loves you back`, call: /^loves_back$/ },
  { label: "Checking each one and choosing your partner", call: /^compare$/ },
  { label: "Reading the books, films and artists your crowd loves", call: /^insights_/ },
];

// The plum pin stays in view this long before the partner screen takes over, so the choice is seen on the map.
const SEE_PARTNER_MS = 900;

function whileReading(run: Run): HTMLElement | null {
  const v = run.ctx.state.venue;
  if (!v.assumed?.slot && !v.assumed?.room && v.house) return null;
  return roomForm(run.ctx, { heading: "While it reads, three things about your room", lead: "Full House assumed a quiet Tuesday from 19:00 and room for 40. Set the real ones, and say what your room can and cannot do." });
}

const wait = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

// The read runs here, with the street map drawing itself from the server's own steps; the partner screen follows.
export async function readingScreen(run: Run, main: HTMLElement): Promise<void> {
  const venue = run.ctx.state.venue;
  const name = plainName(venue.entity.name);
  if (run.ctx.state.read) {
    navigate(firstPath(run.ctx.id, "match"), { replace: true });
    return;
  }
  title(`Reading the crowd of ${name}`);
  credit("Taste data from Qloo. Map data from OpenStreetMap contributors. Choice by Full House.");
  const map = readingMap(venue);
  const steps = serverProgress("Each line ticks when its step is done", READ_STEPS, () => api.progress(run.ctx.id, run.ctx.token), (p) => {
    if (p.places) map.places(p.places);
    if (p.partnerId) map.partner(p.partnerId);
  });
  const stepsPanel = h("section", { class: "panel" }, steps.el);
  const head = screenHead(`Reading the crowd of ${name}`, "Full House takes the places your crowd loves nearby, checks each one and chooses one partner.");
  replace(
    main,
    h("div", { class: "screen" }, h("div", { class: "wrap" }, head, h("div", { class: "screen-grid" }, h("div", { class: "stack" }, map.el, stepsPanel), h("div", { class: "stack" }, whileReading(run))))),
  );
  head.querySelector("h1")?.focus({ preventScroll: true });
  const at = ticket();
  try {
    const read = await readOf(run);
    steps.finish();
    if (!isCurrent(at)) return;
    const m = read.match;
    warmImages([venue.entity, m?.partner, ...(m?.runnersUp ?? [])]);
    map.places(read.lovedPlaces);
    if (m) map.partner(m.partner.id, m.partner);
    const seen = map.partnerSince();
    const left = seen === null ? 0 : SEE_PARTNER_MS - (Date.now() - seen);
    if (left > 0) await wait(left);
    if (!isCurrent(at)) return;
    navigate(firstPath(run.ctx.id, "match"), { replace: true });
  } catch (err) {
    if (!isCurrent(at)) return;
    replace(stepsPanel, failure(err, () => void readingScreen(run, main)));
  }
}
