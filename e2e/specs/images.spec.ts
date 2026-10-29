import { createVenue, openAsOwner, publishedNight } from "../support/owner.ts";
import { expect, test } from "../support/test.ts";

// The root tsconfig has no DOM types, so the image fields read here are named by hand.
interface Img {
  complete: boolean;
  naturalWidth: number;
  getAttribute(name: string): string | null;
}

const LOADED = (imgs: unknown[]) =>
  imgs.map((i) => {
    const img = i as Img;
    return { src: img.getAttribute("src") ?? "", ok: img.complete && img.naturalWidth > 0 };
  });

test("covers and place photos come through the Worker's /img/ path and the browser never asks images.qloo.com", async ({ page, request, traffic }) => {
  const owner = await createVenue(request, { name: "Lantern Record Bar", city: "Leeds" });
  await openAsOwner(page, owner, "/street");
  await page.getByRole("button", { name: "Read the street" }).click();
  const shelfImgs = page.locator(".shelf .cover img");
  await expect.poll(() => shelfImgs.count()).toBeGreaterThan(20);
  const first = shelfImgs.first();
  await first.scrollIntoViewIfNeeded();
  await expect.poll(() => first.evaluate((i) => (i as unknown as Img).complete && (i as unknown as Img).naturalWidth > 0)).toBe(true);

  const pins = page.locator(".map .pin-place img");
  await expect.poll(() => pins.count()).toBeGreaterThan(0);
  await expect.poll(async () => (await pins.evaluateAll(LOADED)).every((p) => p.ok)).toBe(true);

  const all = await page.locator("img").evaluateAll((imgs) => imgs.map((i) => (i as unknown as Img).getAttribute("src") ?? ""));
  expect(all.filter((s) => !s.startsWith("/img/") && !s.includes("tile.openstreetmap.org") && !s.startsWith("data:"))).toEqual([]);
  expect(all.some((s) => s.includes("images.qloo.com"))).toBe(false);

  // A pick without an image shows its name on paper instead of a broken picture.
  const blanks = page.locator(".shelf .cover-none .cover-paper");
  if ((await blanks.count()) > 0) await expect(blanks.first()).not.toHaveText("");

  const res = await request.get(all.find((s) => s.startsWith("/img/")) ?? "/img/missing");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/^image\//);
  expect(res.headers()["cache-control"]).toContain("max-age=604800");
  expect(traffic.hosts()).not.toContain("images.qloo.com");
});

test("the image path refuses anything but a Qloo image", async ({ request }) => {
  for (const path of ["/img/", "/img/i/%2e%2e/api/health", "/img/i/a.jpg?u=https://evil.example", "/img//evil.example/a.jpg"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
    expect(res.headers()["content-type"], path).toContain("text/plain");
  }
});

test("the public event page prints the feature's cover and shows nearby places, all from this site", async ({ page, request }) => {
  const { night } = await publishedNight(request, { name: "Fernhill Bookshop", city: "Ghent", tz: "Europe/Brussels" });
  const res = await page.goto(`/e/${night.eventSlug}`);
  expect(res?.status()).toBe(200);
  const html = (await res?.text()) ?? "";
  expect(html).not.toContain("images.qloo.com");
  const imgs = await page.locator("img").evaluateAll(LOADED);
  expect(imgs.every((i) => i.src.startsWith("/img/"))).toBe(true);
  if (night.feature?.image) await expect(page.locator(".flyer .print img")).toHaveCount(1);
  // No partner has said yes yet, so the page names none of them.
  await expect(page.locator(".near li")).toHaveCount(0);
  for (const p of night.partners) await expect(page.locator("body")).not.toContainText(p.name);
});
