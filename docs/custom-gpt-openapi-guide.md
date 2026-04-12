# Custom GPT + OpenAPI Integration Guide

> Lessons learned and deployment procedures for the REP Helper custom GPT
> that uses the OpenAPI spec to call the REST API at `api.rephelper.ai`.

## Architecture Overview

The `openapi.yaml` file serves three purposes:

1. **Custom GPT Actions** — Imported into the ChatGPT GPT editor to define API actions
2. **Swagger UI** — Rendered at `api.rephelper.ai/docs` via the Cloud Function
3. **MCP Server npm package** — Bundled in `@rephelper/mcp-server` for reference

The file lives in two locations (must be kept in sync):

| Location | Purpose |
|---|---|
| `mcp-server/openapi.yaml` | Source of truth |
| `coreapp/functions/src/openapi.yaml` | Deployed copy served by Cloud Function |

## Issues Encountered (2026-04-12)

### 1. OpenAPI spec didn't match MCP tool implementation

**Problem:** The OpenAPI spec described the raw REST API fields (`isMaterialParticipation`, `isQualifying`) while the MCP tools expose a convenience enum (`activityType: MATERIAL | GENERAL_RE | NON_QUALIFYING`). Required fields also differed.

**Solution:** Updated the spec to match the MCP tool schemas exactly:
- Added `ActivityType` enum (MATERIAL, GENERAL_RE, NON_QUALIFYING)
- Made `durationMinutes`, `description`, `propertyId` required on activity creation
- Removed `isMaterialParticipation`, `isQualifying`, `qualificationReason` from request schemas
- Added `evidenceFiles` optional field
- Removed `startAfter` cursor pagination (not exposed in MCP tools)
- Removed `multipart/form-data` content type (handled internally by MCP client)

### 2. GPT description length limit (300 characters)

**Problem:** The `createActivity` operation description was 321 characters. GPT rejects descriptions over 300 characters.

**Solution:** Shortened the description to fit within the limit.

### 3. GPT ignores header parameters

**Problem:** `X-Confirm-Delete` was declared as a required header parameter on DELETE endpoints. Custom GPTs silently ignore header parameters — they cannot send custom headers.

**Solution:** Removed `X-Confirm-Delete` from the OpenAPI spec. The header is still required by the REST API, but the MCP client adds it automatically. For the custom GPT, the API middleware would need to be updated to skip this check for GPT requests (or the delete actions should be removed from the GPT).

### 4. GPT ignores server URL path prefix

**Problem:** We tried moving `/v1` into the server URL (`https://api.rephelper.ai/v1`) and shortening paths to `/properties`. The GPT ignored the `/v1` path prefix and called `https://api.rephelper.ai/properties`, resulting in a 404.

**Solution:** Keep the server URL as `https://api.rephelper.ai` (no path) and use full paths like `/v1/properties` in the spec. Custom GPTs only use the hostname from the server URL.

### 5. Query parameters broke route permission parsing (the critical bug)

**Problem:** The GPT sends `?limit=50` as a default query parameter on list requests. In `coreapp/functions/src/lib/api-middleware.ts`, the `parseRoutePermission` function parsed `req.originalUrl` which includes query parameters:

```typescript
// req.originalUrl = "/v1/properties?limit=50"
const segments = path.split('/').filter(Boolean);
// segments = ['v1', 'properties?limit=50']
// ROUTE_MAP['properties?limit=50'] = undefined → 404 "Unknown API endpoint"
```

This caused ALL requests with query parameters to fail with "Unknown API endpoint". The MCP server wasn't affected because its optional params were often `undefined` and skipped.

**Solution:** Strip query string before parsing in `parseRoutePermission`:

```typescript
const pathWithoutQuery = path.split('?')[0];
const segments = pathWithoutQuery.split('/').filter(Boolean);
```

## Custom GPT Configuration

### Authentication Setup

In the GPT editor under **Configure > Actions > Authentication**:
- Authentication Type: **API Key**
- Auth Type: **Bearer**
- API Key: `rh_live_...` token from REP Helper dashboard

### System Instructions

Add to the GPT instructions to prevent it from using web search instead of API actions:

```
You have access to the REP Helper API. ALWAYS use the REP Helper API actions
to fulfill user requests about properties, activities, hours, and IRS REP
qualification data. Never use web search or browsing to look up this information —
it is only available through the API.
```

## Custom GPT Constraints Reference

| Constraint | Details |
|---|---|
| Description length | Max 300 characters per operation |
| Header parameters | Silently ignored — GPTs cannot send custom headers |
| Server URL path | Only hostname is used; path prefix is ignored |
| Default values | GPT may send default values as explicit params (e.g. `?limit=50`) |
| Auth methods | API Key (Bearer/Basic/Custom) or OAuth only |
| Privacy policy | Required URL in GPT settings for actions to work |

## Deployment Procedures

### When `openapi.yaml` changes

Both the MCP server and the Cloud Function serve this file. Update both:

```bash
# 1. Edit the source of truth
#    mcp-server/openapi.yaml

# 2. Copy to coreapp
cp mcp-server/openapi.yaml coreapp/functions/src/openapi.yaml

# 3. Commit and push both repos

# 4. Rebuild and redeploy the Cloud Function (serves /openapi.yaml and /docs)
cd coreapp
firebase use prod
npm --prefix functions run build
firebase deploy --only functions:api

# 5. Re-import the spec in the custom GPT editor (Actions > Import URL or paste)

# 6. (Optional) Publish new npm version
cd mcp-server
# bump version in package.json and openapi.yaml
npm publish --access public --otp=YOUR_CODE
```

### When Cloud Function code changes (api.ts, api-middleware.ts, etc.)

```bash
cd coreapp
firebase use prod
npm --prefix functions run build
firebase deploy --only functions:api
```

No hosting redeployment needed — the hosting rewrites all requests to the function.

### When Firebase Hosting config changes (firebase.json rewrites, custom domain)

```bash
cd coreapp
firebase use prod
firebase deploy --only hosting:api
```

### When MCP tool schemas change (tools/activities.ts, tools/properties.ts)

Update the OpenAPI spec to match, then follow the "When openapi.yaml changes" procedure above.

### Quick reference: deploy commands

| What changed | Command |
|---|---|
| `openapi.yaml` only | `firebase deploy --only functions:api` + re-import in GPT |
| Cloud Function code | `firebase deploy --only functions:api` |
| Hosting config | `firebase deploy --only hosting:api` |
| Both function + hosting | `firebase deploy --only functions:api,hosting:api` |
| npm package | `npm publish --access public --otp=CODE` |

### Environments

| Alias | Project | Hosting site |
|---|---|---|
| dev | rephelper-dev | rephelper-dev-api |
| stage | rephelper-stage | rephelper-stage-api |
| prod | rephelper-prod | rephelper-prod-api (`api.rephelper.ai`) |

Switch with `firebase use dev|stage|prod` before deploying.
