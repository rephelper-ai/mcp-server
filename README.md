# @rephelper/mcp-server

MCP server for [REP Helper](https://rephelper.ai) — let AI agents manage real estate activities and properties for IRS REP (Real Estate Professional) qualification tracking.

## Prerequisites

- **Node.js 20+** — [download](https://nodejs.org)
- **REP Helper Elite account** — [rephelper.ai](https://rephelper.ai)
- **API token** — Create one in REP Helper → Settings → API Tokens

## Quick Start

### 1. Create an API Token

In the REP Helper app, go to **Settings → API Tokens → Create Token**. Grant the permissions you need (e.g., activities read/create, properties read). Copy the token — it's shown only once.

### 2. Configure Your AI Client

Add the following to your client's MCP configuration:

**Claude Desktop** — Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rephelper": {
      "command": "npx",
      "args": ["-y", "@rephelper/mcp-server"],
      "env": {
        "REPHELPER_API_TOKEN": "rh_live_your_token_here"
      }
    }
  }
}
```

**Claude Code** — Edit `.claude/settings.json` or use the `/mcp` command:

```json
{
  "mcpServers": {
    "rephelper": {
      "command": "npx",
      "args": ["-y", "@rephelper/mcp-server"],
      "env": {
        "REPHELPER_API_TOKEN": "rh_live_your_token_here"
      }
    }
  }
}
```

**Cursor** — Edit `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "rephelper": {
      "command": "npx",
      "args": ["-y", "@rephelper/mcp-server"],
      "env": {
        "REPHELPER_API_TOKEN": "rh_live_your_token_here"
      }
    }
  }
}
```

**Gemini CLI** — Edit `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "rephelper": {
      "command": "npx",
      "args": ["-y", "@rephelper/mcp-server"],
      "env": {
        "REPHELPER_API_TOKEN": "rh_live_your_token_here"
      }
    }
  }
}
```

**Windsurf** — Edit `.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "rephelper": {
      "command": "npx",
      "args": ["-y", "@rephelper/mcp-server"],
      "env": {
        "REPHELPER_API_TOKEN": "rh_live_your_token_here"
      }
    }
  }
}
```

### 3. Start Using It

Ask your AI assistant to manage your real estate activities:

> "Log 2 hours of property management for 123 Main St today"

> "Show me all my activities from last week"

> "Add a new long-term rental property at 456 Oak Ave, Austin, TX 78701"

## Available Tools

### Activities

| Tool | Description |
|------|-------------|
| `list_activities` | List activities with optional filters (property, date range, category) |
| `get_activity` | Get a single activity by ID |
| `create_activity` | Log a new activity with optional trips and evidence files |
| `update_activity` | Update an existing activity |
| `delete_activity` | Soft-delete an activity (recoverable for 72 hours) |

### Properties

| Tool | Description |
|------|-------------|
| `list_properties` | List properties with optional type filter |
| `get_property` | Get a single property by ID |
| `create_property` | Add a new rental property |
| `update_property` | Update an existing property |
| `delete_property` | Soft-delete a property (recoverable for 72 hours) |

### Activity Categories

- `Management & Operations`
- `Maintenance & Repairs`
- `Development & Construction`
- `Acquisition & Brokerage`
- `Administrative & Compliance`

### Evidence Files

When creating or updating activities, you can attach evidence files from your local filesystem:

- Supported formats: JPEG, PNG, WebP, PDF
- Maximum 3 files per activity
- Maximum 10MB per file

Example: *"Log a maintenance activity and attach the receipt from /Users/me/Downloads/receipt.jpg"*

### Trips

Associate up to 3 trips with an activity. Trip travel time is automatically added to the activity duration.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REPHELPER_API_TOKEN` | Yes | — | Your API token (`rh_live_*` format) |
| `REPHELPER_API_URL` | No | `https://api.rephelper.ai` | API base URL override |

## API Documentation

Interactive API docs are available at [api.rephelper.ai/docs](https://api.rephelper.ai/docs).

The OpenAPI spec is available at [api.rephelper.ai/openapi.yaml](https://api.rephelper.ai/openapi.yaml).

## Troubleshooting

**"REPHELPER_API_TOKEN environment variable is required"**
- Make sure you added the `env` block to your MCP config with your token.

**"Token is invalid or not found"**
- Double-check your token value. It should start with `rh_live_`.
- The token may have been revoked — create a new one in REP Helper.

**"Permission denied: Token lacks X permission"**
- Your token doesn't have the required permission. Edit the token in REP Helper → API Tokens to add it.

**"API access requires an Elite subscription"**
- API tokens are available on the Elite plan. Upgrade at [rephelper.ai](https://rephelper.ai).

**"Rate limited: Too many requests"**
- Wait a moment and try again. Limits: 60 reads/min, 30 writes/min, 5 deletes/min.

## License

MIT
