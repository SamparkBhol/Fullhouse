// Connects to a Full House /mcp endpoint as an MCP client, lists the tools and calls the read only one.
// Usage: node scripts/mcp_check.mjs [site] [venue name] [city]
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const site = (process.argv[2] ?? "https://fullhouse.sampark-bhol.workers.dev").replace(/\/$/, "");
const name = process.argv[3] ?? "Daunt Books";
const city = process.argv[4] ?? "London";

const client = new Client({ name: "fullhouse-mcp-check", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(`${site}/mcp`)));
const server = client.getServerVersion();
console.log(`Connected to ${server?.name} ${server?.version} at ${site}/mcp`);

const { tools } = await client.listTools();
console.log(`${tools.length} tools`);
for (const t of tools) console.log(`  ${t.name}${t.annotations?.readOnlyHint ? " (read only)" : ""}  ${t.title ?? ""}`);

const readOnly = tools.find((t) => t.annotations?.readOnlyHint && t.name === "find_venue");
if (!readOnly) throw new Error("find_venue is not listed as a read only tool");
const result = await client.callTool({ name: readOnly.name, arguments: { name, city } });
if (result.isError) throw new Error(`find_venue failed ${JSON.stringify(result.content)}`);
const found = result.structuredContent?.candidates ?? [];
console.log(`find_venue "${name}" in ${city} returned ${found.length} places`);
for (const c of found.slice(0, 3)) console.log(`  ${c.name}, ${c.address ?? "no address"}`);
await client.close();
