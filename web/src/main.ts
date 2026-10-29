import "@fontsource-variable/archivo/wdth.css";
import "./styles/index.css";
import { notFound, route, startRouter } from "./router.ts";
import { mountShell } from "./ui/shell.ts";
import { fitHeadlines } from "./ui/flyer.ts";
import { landingPage } from "./pages/landing.ts";
import { firstRunPage } from "./pages/first-run.ts";
import { venuePage } from "./pages/venue.ts";
import { streetPage } from "./pages/street.ts";
import { nightPage } from "./pages/night.ts";
import { approvePage } from "./pages/approve.ts";
import { publishedPage } from "./pages/published.ts";
import { eventbritePage } from "./pages/eventbrite.ts";
import { proofPage } from "./pages/proof.ts";
import { settingsPage } from "./pages/settings.ts";
import { confirmPage } from "./pages/confirm.ts";
import { howPage, notFoundPage } from "./pages/how.ts";
import { livePage } from "./pages/live.ts";
import { dashboardPage } from "./pages/dashboard.ts";

const root = document.getElementById("app");
if (root) {
  mountShell(root);
  route("/", () => landingPage());
  route("/start", () => landingPage());
  route("/how", () => howPage());
  route("/live", () => livePage());
  route("/v/:id", (p) => venuePage(p.id ?? ""));
  route("/v/:id/first", (p) => firstRunPage(p.id ?? "", "crowd"));
  route("/v/:id/first/match", (p) => firstRunPage(p.id ?? "", "match"));
  route("/v/:id/first/night", (p) => firstRunPage(p.id ?? "", "night"));
  route("/v/:id/first/ask", (p) => firstRunPage(p.id ?? "", "ask"));
  route("/v/:id/street", (p) => streetPage(p.id ?? ""));
  route("/v/:id/proof", (p) => proofPage(p.id ?? ""));
  route("/v/:id/dashboard", (p) => dashboardPage(p.id ?? ""));
  route("/v/:id/venue", (p) => settingsPage(p.id ?? ""));
  route("/v/:id/eventbrite", (p) => eventbritePage(p.id ?? ""));
  route("/v/:id/confirm", (p) => confirmPage(p.id ?? ""));
  route("/v/:id/night/:planId", (p) => nightPage(p.id ?? "", p.planId ?? ""));
  route("/v/:id/night/:planId/approve", (p) => approvePage(p.id ?? "", p.planId ?? ""));
  route("/v/:id/nights/:nightId", (p) => publishedPage(p.id ?? "", p.nightId ?? ""));
  notFound(() => notFoundPage());
  startRouter();
  let pending = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(pending);
    pending = window.setTimeout(() => fitHeadlines(document), 150);
  });
}
