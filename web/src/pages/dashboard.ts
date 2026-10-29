import type { VenueDashboard } from "../../../src/shared/stats.ts";
import { zoneTime } from "../charts/time.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { withVenue } from "../venue-context.ts";
import { tallyBoard } from "./dashboard-panels.ts";
import { mountBoard } from "./live-board.ts";

export function dashboardPath(id: string): string {
  return `/api/venues/${encodeURIComponent(id)}/dashboard`;
}

export function dashboardPage(id: string): Promise<void> {
  return withVenue(id, "numbers", (ctx, main) => {
    const tz = ctx.state.venue.tz;
    title(`Your numbers, ${ctx.state.venue.entity.name}`);
    mountBoard<VenueDashboard>(main, {
      name: "venue",
      heading: "Your numbers",
      intro: () => `From your own nights and Monday runs. Times are ${zoneTime(tz)}, where your venue is.`,
      tz,
      url: () => dashboardPath(id),
      token: ctx.token,
      withRange: false,
      defaultRefresh: "10s",
      quiet: true,
      panes: (d, tools) => [tallyBoard(d, tools)],
    });
    focusHeading();
  });
}
