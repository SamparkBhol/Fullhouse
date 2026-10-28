import { weekdayInThreeDays } from "../support/dates.ts";
import { openAsOwner, publishedNight } from "../support/owner.ts";
import { expect, test } from "../support/test.ts";

function dayAfter(date: string): Date {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000);
}

test("after the night the owner logs how many came, and it stays with the venue", async ({ page, request }) => {
  const { owner, night } = await publishedNight(request, { name: "Foundry Arcade", city: "Leeds", weekday: weekdayInThreeDays() });
  await openAsOwner(page, owner, `/nights/${night.id}`);
  await expect(page.locator("section", { has: page.getByRole("heading", { name: "Turnout" }) })).toContainText("After the night, come back here");

  await page.clock.setFixedTime(dayAfter(night.date));
  await page.reload();
  await page.getByLabel("How many people came").fill("27");
  await page.getByLabel("Anything to remember").fill("Full by nine, ran out of oat milk");
  await page.getByRole("button", { name: "Save the turnout" }).click();
  await expect(page.locator(".notice")).toHaveText("Turnout saved.");
  await expect(page.locator(".big-line")).toHaveText("27 people came.");
  await expect(page.locator(".monday-line")).toHaveText(/^27 of 40 seats\. Monday keeps .+ nights in the mix\.$/);

  const res = await request.get(`/api/venues/${owner.venue.id}`, { headers: { authorization: `Bearer ${owner.token}` } });
  const saved = ((await res.json()) as { nights: Array<{ id: string; headcount?: number; status: string }> }).nights.find((n) => n.id === night.id);
  expect(saved).toMatchObject({ headcount: 27, status: "done" });

  await page.getByRole("link", { name: "Nights", exact: true }).click();
  await expect(page.locator("section", { has: page.getByRole("heading", { name: "Published nights" }) })).toContainText("27 people came");
});
