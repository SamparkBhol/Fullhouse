import { shortName } from "../../src/shared/words.ts";
import { openAsOwner, publishedNight } from "../support/owner.ts";
import { expect, test } from "../support/test.ts";

test("each place shares its own link, and the owner sees whose link each RSVP came through", async ({ page, request }) => {
  test.setTimeout(90_000);
  const { owner, night } = await publishedNight(request, { name: "Willow Books", city: "Leeds" });
  test.skip(!night.pair || !night.shareLinks?.partner, "the fake street gave this venue no partner");
  const partner = night.match?.partner.name ?? "";
  const theirs = new URL(night.shareLinks?.partner ?? "");
  await page.goto(theirs.pathname + theirs.search);
  await expect(page.locator(".stops > li")).toHaveCount(2);
  await expect(page.locator("body")).toContainText(partner);
  await page.getByRole("button", { name: "I am going" }).click();
  await expect(page.getByText("You are on the list. See you there.")).toBeVisible();

  await openAsOwner(page, owner, `/nights/${night.id}`);
  await expect(page.locator(".ledger-line")).toHaveText(`From your link 0. From ${shortName(partner)}'s link 1.`, { timeout: 15_000 });
  await expect(page.getByRole("link", { name: night.shareLinks?.venue ?? "" })).toBeVisible();
});
