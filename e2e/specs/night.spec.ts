import { createVenue, openAsOwner, readStreet } from "../support/owner.ts";
import { expect, test } from "../support/test.ts";

test("a plan carries its reasons and says who wrote the copy, a plain phrase changes it, and approval publishes it", async ({ page, request }) => {
  const owner = await createVenue(request, { name: "Juniper Books", city: "Leeds", ownerEmail: "owner@example.com" });
  await readStreet(request, owner);
  const health = (await (await request.get("/api/health")).json()) as { ai: boolean };
  expect(health.ai).toBe(false);
  await openAsOwner(page, owner);
  await page.getByRole("button", { name: "Plan a night for Tuesday" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^A night for Tuesday \d+ \w+$/);
  await expect(page.locator(".options")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Another idea" })).toBeVisible();
  await expect(page.locator(".night-window .flyer")).toBeVisible();
  const receipts = page.locator("details.receipts");
  await expect(receipts).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Qloo calls/ })).toHaveCount(0);
  await expect(page.locator(".because-call:visible")).toHaveCount(0);
  await receipts.locator("> summary").click();
  const why = receipts.locator(".fold", { has: page.getByRole("heading", { name: "Why this night" }) });
  await expect(why.locator(".because-row").first()).toContainText(/Call \d+/);
  await expect(page.locator(".ledge-walk .postcard").first().locator(".postcard-walk")).toContainText("min walk");
  await expect(page.locator(".written-by")).toHaveText("Copy from template");
  await expect(page.locator(".claim")).toBeVisible();
  await expect(page.getByText("A personal streaming account does not cover playing music to customers.")).toBeVisible();
  await expect(page.locator(".sleeve")).toHaveCount(0);

  await why.locator(".because-row").first().click();
  await expect(page.getByRole("dialog").locator(".receipt-focus")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  await expect(page.getByLabel("What should change?")).toBeHidden();
  await page.getByRole("button", { name: "Change it" }).click();
  await page.getByLabel("What should change?").fill("make it Friday, under 30 people");
  await page.getByRole("button", { name: "Change the plan" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^A night for Friday \d+ \w+$/);

  await page.getByRole("link", { name: "Review and publish" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Publish this night");
  const actions = page.locator(".actions-list li.action");
  await expect(actions).toHaveCount(5);
  for (const name of ["Publish the event page", "Make the poster", "Make a calendar file", "Make a Google Calendar link", "Draft notes to the partners"]) {
    await expect(page.getByRole("checkbox", { name: new RegExp(name) })).toBeChecked();
  }
  await expect(page.getByRole("checkbox", { name: /Create the Eventbrite event/ })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /Email me the links/ })).toHaveCount(0);
  await expect(page.getByText("Email is off on this server.")).toHaveCount(0);
  const title = page.getByLabel("Title", { exact: true });
  await expect(title).not.toHaveValue("");
  await title.fill("Friday night at Juniper Books");
  const partnerEmails = page.locator(".partner-emails input[type=email]");
  await expect(partnerEmails).not.toHaveCount(0);
  await partnerEmails.first().fill("events@partner.example");

  await page.getByRole("button", { name: "Publish the night" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Published");
  const live = page.locator("section", { has: page.getByRole("heading", { name: "Out on the street" }) });
  await expect(live.getByRole("link", { name: "Public event page" })).toHaveAttribute("href", /\/e\/[^/]+$/);
  await expect(live.getByRole("link", { name: "Printable poster" })).toHaveAttribute("href", /\/poster$/);
  await expect(live.getByRole("link", { name: "Calendar file (.ics)" })).toHaveAttribute("href", /\.ics$/);
  await expect(live.getByRole("link", { name: "Add to Google Calendar" })).toHaveAttribute("href", /^https:\/\/calendar\.google\.com\//);

  await expect(page).toHaveTitle(/^Friday night at Juniper Books/);
  const yours = page.locator("section", { has: page.getByRole("heading", { name: "For you to send" }) });
  const draft = yours.locator(".result").filter({ hasText: "Addressed to events@partner.example" });
  await expect(draft.getByRole("link", { name: /^Draft to / })).toHaveAttribute("href", /^mailto:events@partner\.example\?/);
  await expect(draft.getByRole("link", { name: "Gmail" })).toHaveAttribute("href", /^https:\/\/mail\.google\.com\//);
  await expect(draft.getByRole("link", { name: "Outlook" })).toHaveAttribute("href", /^https:\/\/outlook\.(live|office)\.com\//);
  await expect(page.locator(".rsvp-line")).toHaveText("Nobody has pressed I am going yet. The count shows here when they do.");

  await page.getByRole("link", { name: "Nights", exact: true }).click();
  await expect(page.getByRole("heading", { name: "On the street now" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next draft" })).toHaveCount(0);
});
