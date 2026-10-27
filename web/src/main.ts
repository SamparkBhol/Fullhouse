import "@fontsource-variable/archivo/wdth.css";
import "./styles/app.css";
import { notFound, route, startRouter } from "./router.ts";
import { mountShell } from "./ui/shell.ts";
import { fitHeadlines } from "./ui/flyer.ts";
import { landingPage } from "./pages/landing.ts";
import { onboardingPage } from "./pages/onboarding.ts";
import { venuePage } from "./pages/venue.ts";
import { streetPage } from "./pages/street.ts";
import { nightPage } from "./pages/night.ts";
import { approvePage } from "./pages/approve.ts";
import { publishedPage } from "./pages/published.ts";
import { eventbritePage } from "./pages/eventbrite.ts";
import { proofPage } from "./pages/proof.ts";
import { settingsPage } from "./pages/settings.ts";
import { howPage, notFoundPage } from "./pages/how.ts";

const root = document.getElementById("app");
if (root) {
  mountShell(root);
  route("/", () => landingPage());
  route("/start", () => onboardingPage());
  route("/how", () => howPage());
  route("/v/:id", (p) => venuePage(p.id ?? ""));
  route("/v/:id/street", (p) => streetPage(p.id ?? ""));
  route("/v/:id/proof", (p) => proofPage(p.id ?? ""));
  route("/v/:id/venue", (p) => settingsPage(p.id ?? ""));
  route("/v/:id/eventbrite", (p) => eventbritePage(p.id ?? ""));
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
