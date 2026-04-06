import { readFileSync, statSync } from "fs";
import { basename, extname } from "path";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(MIME_TYPES));
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface ClientConfig {
  apiToken: string;
  baseUrl: string;
}

export interface ApiResponse<T = unknown> {
  ok: true;
  data: T;
  meta: { requestId: string; tokenPrefix: string };
}

export interface ApiError {
  ok: false;
  status: number;
  code: string;
  message: string;
}

export type ApiResult<T = unknown> = ApiResponse<T> | ApiError;

/**
 * Map an API error response to a human-readable message for the LLM.
 */
function formatErrorMessage(status: number, code: string, message: string): string {
  switch (code) {
    case "unauthenticated":
      return "Authentication failed: Check your REPHELPER_API_TOKEN environment variable.";
    case "invalid_token":
      return "Authentication failed: Token is invalid or not found.";
    case "token_expired":
      return "Authentication failed: Token has expired. Create a new token in REP Helper → API Tokens.";
    case "token_revoked":
      return "Authentication failed: Token has been revoked. Create a new token in REP Helper → API Tokens.";
    case "permission_denied":
      return `Permission denied: ${message}. Update token permissions in REP Helper → API Tokens.`;
    case "tier_required":
      return "API access requires an Elite subscription. Upgrade at rephelper.ai.";
    case "ip_not_allowed":
      return "Access denied: Your IP address is not in the token's allowlist.";
    case "not_found":
      return `Not found: ${message}`;
    case "rate_limited":
      return "Rate limited: Too many requests. Wait a moment and try again.";
    case "delete_confirmation_required":
      return "Delete confirmation required (this is a bug — the MCP server should handle this automatically).";
    case "invalid_argument":
      return `Validation error: ${message}`;
    default:
      if (status >= 500) return `Server error: ${message}. Try again or contact support.`;
      return `Error (${code}): ${message}`;
  }
}

/**
 * Validate a local file path for evidence upload.
 * Returns the file buffer and metadata, or throws with a user-friendly message.
 */
function validateFile(filePath: string): { buffer: Buffer; filename: string; mimeType: string } {
  const ext = extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `File "${basename(filePath)}" has unsupported type "${ext}". Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
    );
  }

  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`File "${basename(filePath)}" exceeds 10MB limit (${(stat.size / 1024 / 1024).toFixed(1)}MB).`);
  }

  const buffer = readFileSync(filePath);
  return {
    buffer,
    filename: basename(filePath),
    mimeType: MIME_TYPES[ext]!,
  };
}

/**
 * Build a multipart/form-data body from JSON data and file paths.
 */
function buildMultipartBody(
  data: Record<string, unknown>,
  filePaths: string[],
): { body: FormData; } {
  const formData = new FormData();
  formData.append("data", JSON.stringify(data));

  for (const filePath of filePaths) {
    const file = validateFile(filePath);
    const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimeType });
    formData.append("evidence", blob, file.filename);
  }

  return { body: formData };
}

export function createClient(config: ClientConfig) {
  const { apiToken, baseUrl } = config;

  async function request<T = unknown>(
    method: string,
    path: string,
    options?: {
      body?: Record<string, unknown>;
      query?: Record<string, string | number | undefined>;
      files?: string[];
      headers?: Record<string, string>;
    },
  ): Promise<ApiResult<T>> {
    // Build URL with query params
    const url = new URL(path, baseUrl);
    if (options?.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    // Build request
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiToken}`,
      ...options?.headers,
    };

    let fetchBody: BodyInit | undefined;

    if (options?.files && options.files.length > 0) {
      // Multipart request (for evidence uploads)
      const { body: formData } = buildMultipartBody(options.body ?? {}, options.files);
      fetchBody = formData;
      // Don't set Content-Type — fetch sets it with the boundary
    } else if (options?.body) {
      headers["Content-Type"] = "application/json";
      fetchBody = JSON.stringify(options.body);
    }

    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body: fetchBody,
      });

      const json = await res.json() as Record<string, unknown>;

      if (!res.ok) {
        const error = json.error as { code: string; message: string } | undefined;
        const code = error?.code ?? "unknown";
        const message = error?.message ?? res.statusText;
        return {
          ok: false,
          status: res.status,
          code,
          message: formatErrorMessage(res.status, code, message),
        };
      }

      return {
        ok: true,
        data: json.data as T,
        meta: json.meta as { requestId: string; tokenPrefix: string },
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        code: "network_error",
        message: `Network error: ${err instanceof Error ? err.message : String(err)}. Check your internet connection.`,
      };
    }
  }

  return {
    get: <T = unknown>(path: string, query?: Record<string, string | number | undefined>) =>
      request<T>("GET", path, { query }),

    post: <T = unknown>(
      path: string,
      body: Record<string, unknown>,
      files?: string[],
    ) => request<T>("POST", path, { body, files }),

    put: <T = unknown>(
      path: string,
      body: Record<string, unknown>,
      files?: string[],
    ) => request<T>("PUT", path, { body, files }),

    del: <T = unknown>(path: string) =>
      request<T>("DELETE", path, { headers: { "X-Confirm-Delete": "true" } }),
  };
}

export type RepHelperClient = ReturnType<typeof createClient>;
