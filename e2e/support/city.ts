import type { Page } from "playwright/test";

// A listed city is picked from the list; any other city goes in the box that opens under Another city.
export async function pickCity(page: Page, city: string): Promise<void> {
  const select = page.getByLabel("City", { exact: true });
  const listed = await select.locator("option").evaluateAll((os, c) => os.some((o) => o.textContent === c), city);
  if (listed) {
    await select.selectOption({ label: city });
    return;
  }
  await select.selectOption("other");
  await page.getByLabel("Your city").fill(city);
}
