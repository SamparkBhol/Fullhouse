import { pickCity } from "../support/city.ts";
import { expect, test } from "../support/test.ts";

test("without a taste data key the server says so plainly and shows nothing in its place", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(await health.json()).toMatchObject({ ok: true, qloo: false });

  const api = await request.post("/api/venues/search", { data: { name: "Juniper Books", city: "Leeds" } });
  expect(api.status()).toBe(503);
  expect(await api.json()).toMatchObject({ error: "qloo_key_missing" });

  await page.goto("/");
  await pickCity(page, "Leeds");
  await page.getByRole("textbox", { name: "Your venue" }).fill("Juniper Books");
  const failure = page.locator(".state-failure");
  await expect(failure.locator(".state-title")).toHaveText("This server has no taste data key");
  await expect(failure).toContainText("Nothing was read and nothing was made up.");
  await expect(page.locator(".find-pick")).toHaveCount(0);
});
