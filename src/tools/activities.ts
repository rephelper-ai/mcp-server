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

export function registerActivityTools(server: McpServer, client: RepHelperClient) {
  server.registerTool(
    "list_activities",
    {
      title: "List Activities",
      description:
        "List real estate activities (hours entries) for the account. " +
        "Returns activities ordered by start time (newest first). " +
        "Filter by property, date range, or category.",
      inputSchema: {
        propertyId: z.string().optional().describe("Filter by property ID"),
        startDate: z.string().optional().describe("Filter activities on or after this date (ISO 8601, e.g. 2026-01-01)"),
        endDate: z.string().optional().describe("Filter activities on or before this date (ISO 8601, e.g. 2026-12-31)"),
        category: z
          .enum([
            "Management & Operations",
            "Maintenance & Repairs",
            "Development & Construction",
            "Acquisition & Brokerage",
            "Administrative & Compliance",
          ])
          .optional()
          .describe("Filter by activity category"),
        limit: z.number().int().min(1).max(100).optional().describe("Max results (default 50, max 100)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ propertyId, startDate, endDate, category, limit }) => {
      const result = await client.get("/v1/activities", {
        propertyId,
        startDate,
        endDate,
        category,
        limit,
      });
      return toToolResult(result);
    },
  );

  server.registerTool(
    "get_activity",
    {
      title: "Get Activity",
      description: "Get a single activity (hours entry) by its ID.",
      inputSchema: {
        id: z.string().describe("The activity ID"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const result = await client.get(`/v1/activities/${id}`);
      return toToolResult(result);
    },
  );

  server.registerTool(
    "create_activity",
    {
      title: "Create Activity",
      description:
        "Log a new real estate activity (hours entry). " +
        "Records time spent on property management, maintenance, etc. for IRS REP qualification tracking. " +
        "Optionally associate trips (travel time added to duration) and attach evidence files from the local filesystem.",
      inputSchema: {
        title: z.string().describe("Activity title/summary (e.g. 'Property inspection at 123 Main St')"),
        category: z
          .enum([
            "Management & Operations",
            "Maintenance & Repairs",
            "Development & Construction",
            "Acquisition & Brokerage",
            "Administrative & Compliance",
          ])
          .describe("Activity category"),
        activityType: z
          .enum(["MATERIAL", "GENERAL_RE", "NON_QUALIFYING"])
          .describe(
            "Activity type for IRS classification. " +
            "MATERIAL = material participation (counts toward both material participation and qualifying hours). " +
            "GENERAL_RE = general real estate (counts toward qualifying hours only). " +
            "NON_QUALIFYING = does not count toward REP compliance.",
          ),
        startTime: z.string().describe("Start time in ISO 8601 format (e.g. 2026-04-06T09:00:00Z)"),
        endTime: z.string().describe("End time in ISO 8601 format (e.g. 2026-04-06T11:00:00Z)"),
        durationMinutes: z
          .number()
          .int()
          .min(1)
          .describe("Activity duration in minutes (e.g. 75 for 1h 15m). Must match startTime/endTime span."),
        description: z.string().describe("Detailed description of the activity for IRS documentation"),
        propertyId: z
          .string()
          .nullable()
          .describe("ID of the associated property. Use null for account-level activities not tied to a specific property (e.g. property acquisition)."),
        isDraft: z.boolean().optional().describe("Whether this is a draft (default false)"),
        irsTest: z
          .enum(["750_HOURS", "MORE_THAN_50_PERCENT", "BOTH", "NONE"])
          .optional()
          .describe("Which IRS test this activity applies to (default NONE)"),
        teamMemberId: z.string().optional().describe("Team member who performed the activity"),
        tripIds: z
          .array(z.string())
          .optional()
          .describe("Trip IDs to associate (max 3). Travel time is added to activity duration."),
        evidenceFiles: z
          .array(z.string())
          .optional()
          .describe("Local file paths to attach as evidence (max 3; JPEG, PNG, WebP, or PDF; max 10MB each)"),
      },
    },
    async (args) => {
      const { evidenceFiles, activityType, ...body } = args;
      const apiBody = {
        ...body,
        isMaterialParticipation: activityType === "MATERIAL",
        isQualifying: activityType === "MATERIAL" || activityType === "GENERAL_RE",
      };
      try {
        const result = await client.post("/v1/activities", apiBody, evidenceFiles);
        return toToolResult(result);
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "update_activity",
    {
      title: "Update Activity",
      description:
        "Update an existing activity. Only include fields you want to change. " +
        "Can add/replace trips, attach new evidence files, or remove existing evidence.",
      inputSchema: {
        id: z.string().describe("The activity ID to update"),
        title: z.string().optional().describe("New title"),
        category: z
          .enum([
            "Management & Operations",
            "Maintenance & Repairs",
            "Development & Construction",
            "Acquisition & Brokerage",
            "Administrative & Compliance",
          ])
          .optional()
          .describe("New category"),
        activityType: z
          .enum(["MATERIAL", "GENERAL_RE", "NON_QUALIFYING"])
          .optional()
          .describe(
            "Update activity type. " +
            "MATERIAL = material participation. " +
            "GENERAL_RE = general real estate (qualifying only). " +
            "NON_QUALIFYING = does not count toward REP compliance.",
          ),
        startTime: z.string().optional().describe("New start time (ISO 8601)"),
        endTime: z.string().optional().describe("New end time (ISO 8601)"),
        durationMinutes: z.number().int().min(1).optional().describe("Update duration in minutes"),
        description: z.string().optional().describe("New description"),
        propertyId: z.string().nullable().optional().describe("New property ID, or null to unlink"),
        isDraft: z.boolean().optional().describe("Update draft status"),
        irsTest: z
          .enum(["750_HOURS", "MORE_THAN_50_PERCENT", "BOTH", "NONE"])
          .optional()
          .describe("Update IRS test"),
        teamMemberId: z.string().optional().describe("Update team member"),
        tripIds: z
          .array(z.string())
          .optional()
          .describe("Replace trip list (max 3). Travel time is recalculated."),
        removeEvidenceIds: z
          .array(z.string())
          .optional()
          .describe("Evidence IDs to unlink from this activity"),
        evidenceFiles: z
          .array(z.string())
          .optional()
          .describe("New local file paths to attach as evidence (max 3 total per activity)"),
      },
    },
    async (args) => {
      const { id, evidenceFiles, activityType, ...body } = args;
      const apiBody: Record<string, unknown> = { ...body };
      if (activityType !== undefined) {
        apiBody.isMaterialParticipation = activityType === "MATERIAL";
        apiBody.isQualifying = activityType === "MATERIAL" || activityType === "GENERAL_RE";
      }
      try {
        const result = await client.put(`/v1/activities/${id}`, apiBody, evidenceFiles);
        return toToolResult(result);
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "delete_activity",
    {
      title: "Delete Activity",
      description:
        "Soft-delete an activity. The activity is hidden from queries but can be " +
        "recovered within 72 hours via the REP Helper web app.",
      inputSchema: {
        id: z.string().describe("The activity ID to delete"),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      const result = await client.del(`/v1/activities/${id}`);
      return toToolResult(result);
    },
  );
}
