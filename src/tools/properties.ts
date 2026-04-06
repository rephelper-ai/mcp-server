import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RepHelperClient, ApiResult } from "../client.js";

/** Convert an ApiResult to an MCP tool response. */
function toToolResult(result: ApiResult) {
  if (result.ok) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
    };
  }
  return {
    content: [{ type: "text" as const, text: result.message }],
    isError: true,
  };
}

export function registerPropertyTools(server: McpServer, client: RepHelperClient) {
  server.registerTool(
    "list_properties",
    {
      title: "List Properties",
      description:
        "List rental properties for the account. " +
        "Optionally filter by property type (SHORT_TERM or LONG_TERM).",
      inputSchema: {
        type: z
          .enum(["SHORT_TERM", "LONG_TERM"])
          .optional()
          .describe("Filter by property type"),
        limit: z.number().int().min(1).max(100).optional().describe("Max results (default 50, max 100)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ type, limit }) => {
      const result = await client.get("/v1/properties", { type, limit });
      return toToolResult(result);
    },
  );

  server.registerTool(
    "get_property",
    {
      title: "Get Property",
      description: "Get a single rental property by its ID.",
      inputSchema: {
        id: z.string().describe("The property ID"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const result = await client.get(`/v1/properties/${id}`);
      return toToolResult(result);
    },
  );

  server.registerTool(
    "create_property",
    {
      title: "Create Property",
      description:
        "Add a new rental property to the account. " +
        "Properties can be SHORT_TERM (STR) or LONG_TERM (LTR) rentals.",
      inputSchema: {
        name: z.string().describe("Property name/label (e.g. 'Beach House' or '123 Main St')"),
        type: z.enum(["SHORT_TERM", "LONG_TERM"]).describe("Property type: SHORT_TERM or LONG_TERM"),
        address: z
          .object({
            streetLine1: z.string().describe("Street address line 1"),
            streetLine2: z.string().optional().describe("Street address line 2"),
            city: z.string().describe("City"),
            state: z.string().describe("State (e.g. TX, CA)"),
            postalCode: z.string().describe("ZIP/postal code"),
            country: z.string().optional().describe("Country code (default US)"),
          })
          .describe("Property address"),
        imageUrl: z.string().optional().describe("URL to property image"),
        acquiredDate: z.string().optional().describe("Date property was acquired (ISO 8601)"),
        placedInServiceDate: z.string().optional().describe("Date property was placed in service (ISO 8601)"),
      },
    },
    async (args) => {
      const result = await client.post("/v1/properties", args);
      return toToolResult(result);
    },
  );

  server.registerTool(
    "update_property",
    {
      title: "Update Property",
      description: "Update an existing property. Only include fields you want to change.",
      inputSchema: {
        id: z.string().describe("The property ID to update"),
        name: z.string().optional().describe("New property name"),
        type: z.enum(["SHORT_TERM", "LONG_TERM"]).optional().describe("New property type"),
        address: z
          .object({
            streetLine1: z.string().describe("Street address line 1"),
            streetLine2: z.string().optional().describe("Street address line 2"),
            city: z.string().describe("City"),
            state: z.string().describe("State"),
            postalCode: z.string().describe("ZIP/postal code"),
            country: z.string().optional().describe("Country code"),
          })
          .optional()
          .describe("New address (replaces entire address)"),
        imageUrl: z.string().optional().describe("New image URL"),
        isActive: z.boolean().optional().describe("Set active/inactive status"),
        acquiredDate: z.string().optional().describe("New acquired date (ISO 8601)"),
        placedInServiceDate: z.string().optional().describe("New placed-in-service date (ISO 8601)"),
        soldDate: z.string().optional().describe("Date property was sold (ISO 8601)"),
      },
    },
    async ({ id, ...body }) => {
      const result = await client.put(`/v1/properties/${id}`, body);
      return toToolResult(result);
    },
  );

  server.registerTool(
    "delete_property",
    {
      title: "Delete Property",
      description:
        "Soft-delete a property. The property is hidden from queries but can be " +
        "recovered within 72 hours via the REP Helper web app.",
      inputSchema: {
        id: z.string().describe("The property ID to delete"),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      const result = await client.del(`/v1/properties/${id}`);
      return toToolResult(result);
    },
  );
}
