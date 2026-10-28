import { test as base, expect } from "playwright/test";
import { BASE_URL, QLOO_HOSTS } from "./env.ts";

export interface BrowserTraffic {
  hosts(): string[];
}

// Map tiles and anything else off the Worker are refused, so the specs never depend on the network.
// Every host the page tried is kept so a spec can prove the browser never spoke to Qloo.
export const test = base.extend<{ traffic: BrowserTraffic }>({
  traffic: [
    async ({ context }, use) => {
      const own = new URL(BASE_URL).host;
      const seen = new Set<string>();
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.protocol === "data:" || url.protocol === "blob:") return route.continue();
        seen.add(url.host);
        return url.host === own ? route.continue() : route.abort("blockedbyclient");
      });
      await use({ hosts: () => [...seen] });
      expect(QLOO_HOSTS.filter((h) => seen.has(h)), "the browser must never call Qloo").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
