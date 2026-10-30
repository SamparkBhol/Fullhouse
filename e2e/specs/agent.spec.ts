import { openAsOwner, createVenue, readStreet } from "../support/owner.ts";
import { expect, test } from "../support/test.ts";

test("the owner presses Run it now and the panel shows the steps the run recorded", async ({ page, request }) => {
  const owner = await createVenue(request, { name: "Quarry Ramen Bar", city: "Portland", tz: "America/Los_Angeles" });
  await readStreet(request, owner);
  await openAsOwner(page, owner);

  const panel = page.locator("section", { has: page.getByRole("heading", { name: "Every Monday" }) });
  await expect(panel).toContainText("It has not run for this venue yet");
  await panel.getByRole("button", { name: "Run it now" }).click();
  await expect(panel.getByRole("heading", { name: /^Last run, / })).toBeVisible({ timeout: 60_000 });
  await expect(panel.locator(".chip")).toHaveText("Started by you");

  const state = (await (await request.get(`/api/venues/${owner.venue.id}`, { headers: { authorization: `Bearer ${owner.token}` } })).json()) as {
    runs: Array<{ calls: number; cached: number; steps: Array<{ key: string; did: string; outcome: string; calls: number }> }>;
  };
  const run = state.runs[0]!;
  const rows = panel.locator(".agent-step");
  await expect(rows).toHaveCount(run.steps.length);
  for (const [i, step] of run.steps.entries()) {
    await expect(rows.nth(i).locator(".agent-did")).toHaveText(step.did);
    await expect(rows.nth(i).locator(".agent-outcome")).toContainText(step.outcome);
  }
  expect(run.steps.map((s) => s.key).slice(0, 2)).toEqual(["read", "partner"]);
  await expect(panel.locator(".agent-total")).toContainText(`${run.calls} Qloo call`);
  expect(run.steps.reduce((n, s) => n + s.calls, 0)).toBe(run.calls);
  await expect(panel.getByRole("link", { name: "Read the draft" })).toBeVisible();

  await panel.getByRole("button", { name: "Run it now" }).click();
  await expect(panel.locator(".agent-status")).toContainText("already ran for you in the last hour");
});

test("How it works lists the MCP tools the server registers", async ({ page, request }) => {
  const info = (await (await request.get("/api/mcp/tools")).json()) as { endpoint: string; tools: Array<{ name: string }> };
  await page.goto("/how");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Use it from any MCP client" }) });
  await expect(section.locator(".mcp-endpoint")).toHaveText(info.endpoint);
  await expect(section.locator(".mcp-tools h3")).toHaveText(info.tools.map((t) => t.name));
});
