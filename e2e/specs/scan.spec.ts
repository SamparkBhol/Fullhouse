import type { APIRequestContext } from "playwright/test";
import type { Invite } from "../../src/shared/contract.ts";
import type { ScanAnswer, ScanRecord } from "../../src/shared/scan.ts";
import { createVenue, planNight, readStreet } from "../support/owner.ts";
import { expect, test } from "../support/test.ts";

const SECRET = process.env.E2E_TOKEN_SECRET ?? "";

function totals(venues: number, twoWay: number): ScanRecord["overall"] {
  return { venues, matched: venues, twoWay, medianFit: 78.5, medianWalk: 6.5, openTogether: Math.floor(venues / 2), formats: [{ format: "book_then_film", label: "book then film", n: 3 }, { format: "drinks_then_set", label: "drinks then set", n: 2 }] };
}

// A test record in the admin route's shape. The real one is written by scripts/scan and posted by scripts/scan/publish.
const RECORD: ScanRecord = {
  at: "2026-10-30T10:50:44.352Z",
  calls: 487,
  method: "Each venue was found with Full House's own place search and read by its own engine, which takes the places its crowd loves.",
  walkMax: 10,
  overall: totals(42, 23),
  cities: [
    { city: "New York", totals: totals(21, 12) },
    { city: "London", totals: totals(21, 11) },
  ],
};

async function store(api: APIRequestContext, token: string | null) {
  return api.post("/api/admin/scan", { data: RECORD, headers: token ? { authorization: `Bearer ${token}` } : {} });
}

test("the landing shows the street scan only once one is stored, with every number from the record", async ({ page, request }) => {
  test.skip(!SECRET, "needs this run's token secret, which npm run e2e passes");
  expect((await (await request.get("/api/scan")).json()) as ScanAnswer).toEqual({ scan: null });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Qloo ranks. Full House decides." })).toBeVisible();
  await expect(page.locator("#scan")).toBeHidden();

  expect((await store(request, null)).status()).toBe(401);
  expect((await store(request, "not-this-runs-secret")).status()).toBe(401);
  expect((await store(request, SECRET)).status()).toBe(201);

  await page.goto("/");
  const band = page.locator("#scan");
  await expect(band.getByRole("heading", { level: 2 })).toHaveText("Run on 42 real venues in New York and London on 30 October 2026.");
  await expect(band).toContainText("23 of the 42 have a partner within a 10 minute walk");
  await expect(band.locator(".scan-facts dd strong")).toHaveText(["78.5 of 100", "6.5 min", "21 of 42"]);
  await expect(band.locator(".street").first().locator(".door-both")).toHaveCount(12);
  await expect(band.locator(".street").first().locator(".door-mark")).toHaveCount(21);
  await expect(band.locator(".street-name b")).toHaveText(["New York", "London"]);
  await expect(band).toContainText("The nights it would plan: book then film 3, drinks then set 2.");
  await expect(band).toContainText("487 taste data answers.");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(band.getByRole("heading", { level: 2 })).toBeVisible();
  expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
});

test("a neighbour picks a reason before its no is sent, the owner reads it, and live numbers count it with the scan", async ({ page, request }) => {
  test.skip(!SECRET, "needs this run's token secret, which npm run e2e passes");
  const owner = await createVenue(request, { name: "Larkspur Books", city: "Leeds" });
  await readStreet(request, owner);
  const { plan } = await planNight(request, owner);
  const partner = plan.match?.partner;
  if (!partner) throw new Error("the plan has no partner to invite");
  const auth = { authorization: `Bearer ${owner.token}` };
  const invite = (await (await request.post(`/api/venues/${owner.venue.id}/nights/${plan.id}/invite`, { headers: auth, data: { partnerId: partner.id } })).json()) as Invite;

  await page.goto(`/i/${invite.slug}`);
  const answer = page.locator("#answer");
  await expect(answer.locator('input[type="radio"][name="reason"]')).toHaveCount(4);
  await expect(answer.locator('input[type="radio"]').first()).toBeHidden();
  await answer.getByText("Not this time", { exact: true }).click();
  await expect(answer.getByRole("group", { name: /^Tell .+ why, so the next ask fits better$/ })).toBeVisible();
  await expect(answer.getByRole("textbox", { name: "In a few words" })).toBeHidden();
  await answer.getByRole("radio", { name: "Something else" }).check();
  await answer.getByRole("textbox", { name: "In a few words" }).fill("Our room is booked that week");
  await answer.getByRole("button", { name: "Send not this time" }).click();
  await expect(answer).toContainText("You said not this time.");
  await expect(answer).toContainText("sees your reason, something else.");
  await expect(answer).not.toContainText("Our room is booked that week");

  const polled = (await (await request.get(`/api/venues/${owner.venue.id}/invites`, { headers: auth })).json()) as Invite[];
  expect(polled.find((i) => i.id === invite.id)).toMatchObject({ status: "declined", declined: { reason: "other", note: "Our room is booked that week" } });

  await page.goto("/live");
  await page.getByRole("radio", { name: "10 s" }).check();
  const answers = page.locator('[data-pane="answers"]');
  await expect(answers.locator(".answer-bar", { hasText: "Something else" }).locator(".num")).toHaveText(/^[1-9]\d*$/, { timeout: 25_000 });
  await expect(answers).not.toContainText("Our room is booked");
  const scan = page.locator('[data-pane="scan"]');
  await expect(scan.getByRole("heading", { level: 2 })).toHaveText("Run on 42 real venues in New York and London on 30 October 2026.");
  await scan.getByText("Show as a table").click();
  await expect(scan.locator("tbody th")).toHaveText(["Both cities", "New York", "London"]);
});
