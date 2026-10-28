import type { VenueDashboard } from "../../../src/shared/stats.ts";
import { zoneName } from "../charts/time.ts";
import { focusHeading, title } from "../ui/shell.ts";
import { withVenue } from "../venue-context.ts";
import { nextPane, mondaysPane, nightsPane, readsPane, roomsPane } from "./dashboard-panels.ts";
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
      intro: () => `From your own nights, street reads and Monday runs. Times are in ${zoneName(tz)}, your venue's time zone.`,
      tz,
      url: () => dashboardPath(id),
      token: ctx.token,
      withRange: false,
      defaultRefresh: "30s",
      panes: (d, tools) => [nextPane(d, tools), nightsPane(d), roomsPane(d), readsPane(d), mondaysPane(d)],
    });
    focusHeading();
  });
}
