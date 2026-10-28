import { createVenue, openAsOwner, readStreet } from "../support/owner.ts";
import { expect, test } from "../support/test.ts";

test("a plan carries its reasons and says who wrote the copy, a plain phrase changes it, and approval publishes it", async ({ page, request }) => {
  const owner = await createVenue(request, { name: "Juniper Books", city: "Leeds", ownerEmail: "owner@example.com" });
  await readStreet(request, owner);
  await openAsOwner(page, owner);
  await page.getByRole("button", { name: "Plan a night for Tuesday" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^A night for Tuesday \d+ \w+$/);
  await expect(page.locator(".options button")).toHaveCount(3);
  await expect(page.locator(".night-window .flyer")).toBeVisible();
  const why = page.locator("section", { has: page.getByRole("heading", { name: "Why this night" }) });
  await expect(why.locator(".because-row").first()).toContainText(/Call \d+/);
  await expect(page.locator(".written-by")).toHaveText("Copy from template");
  await expect(page.locator(".claim")).toBeVisible();
  await expect(page.getByText("A personal streaming account does not cover playing music to customers.")).toBeVisible();

  await why.locator(".because-row").first().click();
  await expect(page.getByRole("dialog").locator(".receipt-focus")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  await page.getByLabel("What should change?").fill("make it Friday, under 30 people");
  await page.getByRole("button", { name: "Change the plan" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^A night for Friday \d+ \w+$/);

  await page.getByRole("link", { name: "Review and publish" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Publish this night");
  const actions = page.locator(".actions-list li.action");
  await expect(actions).toHaveCount(7);
  const eventbrite = page.getByRole("checkbox", { name: /Create the Eventbrite event/ });
  await expect(eventbrite).toBeDisabled();
  await expect(eventbrite).not.toBeChecked();
  for (const name of ["Publish the event page", "Make the poster", "Make a calendar file", "Make a Google Calendar link", "Email me the links"]) {
    await expect(page.getByRole("checkbox", { name: new RegExp(name) })).toBeChecked();
  }
  const partnerEmails = page.locator(".partner-emails input[type=email]");
  const partners = await partnerEmails.count();
  if (partners) await partnerEmails.first().fill("events@partner.example");

  await page.getByRole("button", { name: "Publish the night" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Published");
  const live = page.locator("section", { has: page.getByRole("heading", { name: "Out on the street" }) });
  await expect(live.getByRole("link", { name: "Public event page" })).toHaveAttribute("href", /\/e\/[^/]+$/);
  await expect(live.getByRole("link", { name: "Printable poster" })).toHaveAttribute("href", /\/poster$/);
  await expect(live.getByRole("link", { name: "Calendar file (.ics)" })).toHaveAttribute("href", /\.ics$/);
  await expect(live.getByRole("link", { name: "Add to Google Calendar" })).toHaveAttribute("href", /^https:\/\/calendar\.google\.com\//);

  const yours = page.locator("section", { has: page.getByRole("heading", { name: "For you to send" }) });
  await expect(yours.getByText("Email is not set up on this server, so nothing was sent.")).toBeVisible();
  if (partners) {
    const draft = yours.locator(".result").filter({ hasText: "Addressed to events@partner.example" });
    await expect(draft.getByRole("link", { name: /^Draft to / })).toHaveAttribute("href", /^mailto:events@partner\.example\?/);
    await expect(draft.getByRole("link", { name: "Gmail" })).toHaveAttribute("href", /^https:\/\/mail\.google\.com\//);
    await expect(draft.getByRole("link", { name: "Outlook" })).toHaveAttribute("href", /^https:\/\/outlook\.(live|office)\.com\//);
  }
  await expect(page.locator(".rsvp-line")).toContainText("0 people have said they are coming.");

  await page.getByRole("link", { name: "Nights", exact: true }).click();
  await expect(page.getByRole("heading", { name: "On the street now" })).toBeVisible();
});
