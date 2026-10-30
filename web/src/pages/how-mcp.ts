import type { McpToolRow, McpTools } from "../../../src/shared/contract.ts";
import { api } from "../api.ts";
import { h, replace } from "../dom.ts";

function toolItem(t: McpToolRow): HTMLElement {
  return h(
    "li",
    null,
    h("div", { class: "panel-head" }, h("h3", null, h("code", null, t.name)), h("span", { class: t.readOnly ? "chip chip-line" : "chip chip-dash" }, t.readOnly ? "Reads only" : "Can change things")),
    h("p", null, t.description),
    h("p", { class: "mcp-args" }, "Takes ", t.args.map((a, i) => [i ? ", " : "", h("code", null, a.name), a.required ? "" : " (optional)"])),
  );
}

function body(info: McpTools): HTMLElement {
  return h(
    "div",
    null,
    h("p", { class: "meta" }, "Any MCP client can connect to this address and ask for the tools below. Full House answers over plain HTTP with JSON, and it keeps no session."),
    h("p", { class: "mcp-endpoint" }, h("code", null, info.endpoint)),
    h("ul", { class: "mcp-tools" }, info.tools.map(toolItem)),
    h("p", { class: "meta" }, "The owner tools need the venue id and owner token from the owner's link. publish_night publishes nothing: it hands back the approval screen where the owner says yes."),
  );
}

// The list is fetched from the server, which builds it from the definitions it registers, so it cannot drift from /mcp.
export function mcpSection(): HTMLElement {
  const slot = h("div", { class: "mcp-body", "aria-live": "polite" }, h("p", { class: "meta" }, "Loading the tool list."));
  api.mcpTools().then(
    (info) => replace(slot, body(info)),
    () => replace(slot, h("p", { class: "meta" }, "The tool list did not load. Reload the page to try again.")),
  );
  return h("section", { class: "section", "aria-labelledby": "mcp-title" }, h("h2", { id: "mcp-title" }, "Use it from any MCP client"), slot);
}
