import { PHONE, SIDEWAYS, SMALL_TARGETS } from "../support/layout.ts";
import { expect, test } from "../support/test.ts";

for (const path of ["/", "/how", "/start"]) {
  test(`${path} fits a 360 px phone with thumb sized controls`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate<string[]>(SIDEWAYS)).toEqual([]);
    expect(await page.evaluate<string[]>(SMALL_TARGETS)).toEqual([]);
  });
}
