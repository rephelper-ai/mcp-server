import { readFileSync, statSync } from "fs";
import { execFileSync } from "child_process";
import { basename, extname, resolve } from "path";

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

  // Send JSON fields as a single "data" field (API expects this for multipart)
  formData.append("data", JSON.stringify(data));

  for (const filePath of filePaths) {
    const file = validateFile(filePath);
    const f = new File([new Uint8Array(file.buffer)], file.filename, { type: file.mimeType });
    formData.append("evidence", f);
  }

  return { body: formData };
}

/**
 * Execute a multipart file upload via curl to avoid Cloudflare bot challenges
 * against Node.js's undici TLS fingerprint.
 */
function requestWithCurl<T = unknown>(
  method: string,
  url: string,
  token: string,
  data: Record<string, unknown>,
  filePaths: string[],
): ApiResult<T> {
  // Validate files first (before spawning curl)
  for (const fp of filePaths) validateFile(fp);

  const args = [
    "-s", "--max-time", "30",
    "-w", "\n__HTTP_STATUS__%{http_code}",
    "-X", method,
    "-H", `Authorization: Bearer ${token}`,
    "-F", `data=${JSON.stringify(data)}`,
  ];

  for (const fp of filePaths) {
    const absPath = resolve(fp);
    const ext = extname(fp).toLowerCase();
    const mimeType = MIME_TYPES[ext]!;
    args.push("-F", `evidence=@${absPath};type=${mimeType}`);
  }

  args.push(url);

  try {
    const output = execFileSync("curl", args, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });

    const statusMatch = output.match(/__HTTP_STATUS__(\d+)/);
    const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    const body = output.replace(/\n__HTTP_STATUS__\d+$/, "");

    if (!body || !body.startsWith("{")) {
      const titleMatch = body.match(/<title>([^<]*)<\/title>/i);
      const hint = titleMatch?.[1]?.trim();
      const detail = hint ? `${httpStatus} ${hint}` : `${httpStatus}`;
      return {
        ok: false,
        status: httpStatus,
        code: "non_json_response",
        message:
          `Server returned an unexpected response (${detail}). ` +
          "The API may be experiencing issues, or a proxy/CDN rejected the request.",
      };
    }

    const json = JSON.parse(body) as Record<string, unknown>;

    if (httpStatus >= 400) {
      const error = json.error as { code: string; message: string } | undefined;
      const code = error?.code ?? "unknown";
      const message = error?.message ?? `HTTP ${httpStatus}`;
      return {
        ok: false,
        status: httpStatus,
        code,
        message: formatErrorMessage(httpStatus, code, message),
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
      message: `File upload failed: ${err instanceof Error ? err.message : String(err)}. Ensure curl is installed and accessible.`,
    };
  }
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

    // Use curl for multipart file uploads to avoid Cloudflare bot challenges
    // against Node.js's TLS fingerprint. Non-file requests use fetch normally.
    if (options?.files && options.files.length > 0) {
      return requestWithCurl<T>(method, url.toString(), apiToken, options.body ?? {}, options.files);
    }

    if (options?.body) {
      headers["Content-Type"] = "application/json";
    }

    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });

      // Detect non-JSON responses (HTML error pages from proxies, CDN, or server)
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        // Try to extract a meaningful title from HTML error pages
        const titleMatch = text.match(/<title>([^<]*)<\/title>/i);
        const hint = titleMatch?.[1]?.trim();
        const detail = hint
          ? `${res.status} ${hint}`
          : `${res.status} ${res.statusText}`;
        return {
          ok: false,
          status: res.status,
          code: "non_json_response",
          message:
            `Server returned an unexpected response (${detail}). ` +
            "The API may be experiencing issues, or a proxy/CDN rejected the request.",
        };
      }

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
