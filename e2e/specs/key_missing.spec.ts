import { expect, test } from "../support/test.ts";

test("without a Qloo key the server says so plainly and shows nothing in its place", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(await health.json()).toMatchObject({ ok: true, qloo: false });

  const api = await request.post("/api/venues/search", { data: { name: "Juniper Books", city: "Leeds" } });
  expect(api.status()).toBe(503);
  expect(await api.json()).toMatchObject({ error: "qloo_key_missing" });

  await page.goto("/start");
  await page.getByLabel("Venue name").fill("Juniper Books");
  await page.getByLabel("City").fill("Leeds");
  await page.getByRole("button", { name: "Look it up" }).click();
  const failure = page.locator(".state-failure");
  await expect(failure.locator(".state-title")).toHaveText("No Qloo key on this server");
  await expect(failure).toContainText("Nothing was read and nothing was made up.");
  await expect(page.locator(".candidate")).toHaveCount(0);
});
