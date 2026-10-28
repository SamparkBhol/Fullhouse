import { icsDate, parseIcs } from "../support/ics.ts";
import { publishedNight } from "../support/owner.ts";
import { expect, test } from "../support/test.ts";

test("the public event page takes one RSVP per browser and the owner sees the count", async ({ page, request }) => {
  const { owner, night } = await publishedNight(request, { name: "Copper Taproom", city: "Leeds" });
  const res = await page.goto(`/e/${night.eventSlug}`);
  expect(res?.headers()["x-robots-tag"]).toContain("noindex");
  expect(res?.headers()["content-security-policy"]).toContain("script-src 'none'");
  await expect(page.locator("meta[property='og:title']")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(night.copy.eventTitle);
  await expect(page.locator(".place")).toContainText("Copper Taproom");
  await expect(page.locator(".rsvp .count")).toHaveText("0 going");

  await page.getByRole("button", { name: "I am going" }).click();
  await expect(page.locator(".rsvp .count")).toHaveText("1 going");
  await expect(page.locator(".rsvp .going")).toHaveText("You are on the list. See you there.");
  await page.reload();
  await expect(page.locator(".rsvp .count")).toHaveText("1 going");
  await expect(page.getByRole("button", { name: "I am going" })).toHaveCount(0);

  await page.context().clearCookies();
  await page.reload();
  await page.getByRole("button", { name: "I am going" }).click();
  await expect(page.locator(".rsvp .count")).toHaveText("2 going");

  const state = await request.get(`/api/venues/${owner.venue.id}`, { headers: { authorization: `Bearer ${owner.token}` } });
  const nights = ((await state.json()) as { nights: Array<{ id: string; rsvps: number }> }).nights;
  expect(nights.find((n) => n.id === night.id)?.rsvps).toBe(2);
});

test("the calendar file parses as one event at the night's time", async ({ request }) => {
  const { night } = await publishedNight(request, { name: "Brass Comedy Cellar", city: "Portland", tz: "America/Los_Angeles" });
  const res = await request.get(`/e/${night.eventSlug}.ics`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const calendar = parseIcs(await res.text());
  expect(calendar.name).toBe("VCALENDAR");
  expect(calendar.props.get("VERSION")).toBe("2.0");
  const [event] = calendar.children;
  expect(event?.name).toBe("VEVENT");
  const props = event?.props ?? new Map<string, string>();
  expect(props.get("SUMMARY")).toContain("Brass Comedy Cellar");
  expect(props.get("URL")).toMatch(new RegExp(`/e/${night.eventSlug}$`));
  const start = icsDate(props.get("DTSTART") ?? "");
  const end = icsDate(props.get("DTEND") ?? "");
  expect(end.getTime() - start.getTime()).toBe(180 * 60_000);
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(start);
  expect(local).toBe(`${night.date}, ${night.start}`);
});

test("the poster renders for print with a QR code to the event page", async ({ page, request }) => {
  const { night } = await publishedNight(request, { name: "Marigold Bakery", city: "Ghent", tz: "Europe/Brussels" });
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto(`/e/${night.eventSlug}/poster`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(night.copy.posterHeadline || night.copy.eventTitle);
  await expect(page.locator(".p-where")).toContainText("Marigold Bakery");
  await expect(page.locator(".p-qr svg")).toBeVisible();
  await expect(page.locator(".p-url")).toHaveText(new RegExp(`/e/${night.eventSlug}$`));
  await expect(page.getByRole("button", { name: "Print the poster" })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-bar")).toBeHidden();
  expect(problems).toEqual([]);
});

test("a night that does not exist answers with a plain not found page", async ({ page }) => {
  const res = await page.goto("/e/no-such-night-aaaaaaaaaaaaaaaaaaaaaa");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "That night is not here" })).toBeVisible();
});
