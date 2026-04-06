#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "./client.js";
import { registerActivityTools } from "./tools/activities.js";
import { registerPropertyTools } from "./tools/properties.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_TOKEN = process.env.REPHELPER_API_TOKEN;
const BASE_URL = process.env.REPHELPER_API_URL ?? "https://api.rephelper.ai";

if (!API_TOKEN) {
  console.error(
    "Error: REPHELPER_API_TOKEN environment variable is required.\n" +
    "Set it in your MCP client config (e.g., claude_desktop_config.json).\n" +
    "Create a token at: REP Helper → Settings → API Tokens",
  );
  process.exit(1);
}

if (!API_TOKEN.startsWith("rh_live_")) {
  console.error(
    'Error: REPHELPER_API_TOKEN must start with "rh_live_".\n' +
    "The token you provided does not look like a valid REP Helper API token.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "rephelper",
  version: "0.1.0",
  description:
    "REP Helper MCP server — manage real estate activities and properties for IRS REP qualification tracking. " +
    "Use list_properties to see available properties before creating activities. " +
    "Activities track time spent on real estate tasks (maintenance, management, etc.). " +
    "Set isMaterialParticipation and isQualifying flags based on whether the work counts toward IRS tests.",
});

const client = createClient({ apiToken: API_TOKEN, baseUrl: BASE_URL });

registerActivityTools(server, client);
registerPropertyTools(server, client);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("REP Helper MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
