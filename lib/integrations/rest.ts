import { authenticateService } from "./auth";
import { apiError, ApiError, checkOrigin, readJson } from "./http";
import { callTool } from "./mcp";

/**
 * REST is a thin mapping onto the MCP tools, so both surfaces always share the
 * same scopes, validation and output allowlists.
 */
export async function restTool(request: Request, name: string, args: (body: Record<string, unknown>) => Record<string, unknown> = () => ({}),
  { body = false, status = 200 }: { body?: boolean; status?: number } = {}) {
  try {
    checkOrigin(request);
    const context = await authenticateService(request);
    let input: Record<string, unknown> = {};
    if (body) {
      const json = await readJson(request);
      if (!json || typeof json !== "object" || Array.isArray(json)) throw new ApiError("JSON object required");
      input = json as Record<string, unknown>;
    }
    const data = await callTool(context, name, args(input));
    return Response.json({ data }, { status, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

/** Numeric query parameters arrive as strings; tools expect numbers. */
export function queryNumber(request: Request, key: string) {
  const value = new URL(request.url).searchParams.get(key);
  if (value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

export function query(request: Request, key: string) {
  return new URL(request.url).searchParams.get(key) ?? undefined;
}

export type IdParams = { params: Promise<{ id: string }> };
