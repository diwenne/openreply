import { z } from "zod";
import { authenticateService } from "@/lib/integrations/auth";
import { apiError, ApiError, checkOrigin, readJson } from "@/lib/integrations/http";
import { callTool, listTools } from "@/lib/integrations/mcp";

const versions = ["2025-03-26", "2025-06-18", "2025-11-25"];
const rpcSchema = z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.string(), z.number()]).optional(), method: z.string(), params: z.unknown().optional() });
export async function GET(request: Request) {
  try { checkOrigin(request); await authenticateService(request); return new Response(null, { status: 405, headers: { Allow: "POST" } }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const context = await authenticateService(request);
    const version = request.headers.get("mcp-protocol-version");
    if (version && !versions.includes(version)) throw new ApiError("Unsupported MCP protocol version");
    const accept = request.headers.get("accept") ?? "";
    if (!accept.includes("application/json") || !accept.includes("text/event-stream")) throw new ApiError("Accept application/json and text/event-stream required", 406);
    const parsed = rpcSchema.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } }, { status: 400 });
    const rpc = parsed.data;
    if (rpc.id === undefined) {
      if (rpc.method !== "notifications/initialized" && rpc.method !== "notifications/cancelled") throw new ApiError("Unknown notification");
      return new Response(null, { status: 202 });
    }
    let result: unknown;
    if (rpc.method === "initialize") {
      const params = z.object({ protocolVersion: z.string(), capabilities: z.object({}).passthrough(), clientInfo: z.object({ name: z.string(), version: z.string() }).passthrough() }).safeParse(rpc.params);
      if (!params.success) return Response.json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32602, message: "Invalid initialize parameters" } });
      result = { protocolVersion: versions.includes(params.data.protocolVersion) ? params.data.protocolVersion : versions.at(-1),
        capabilities: { tools: { listChanged: false } }, serverInfo: { name: "openreply", version: "1.0.0" }, instructions: "Read-only and workspace-scoped. No tool can modify campaigns or send messages." };
    } else if (rpc.method === "ping") result = {};
    else if (rpc.method === "tools/list") result = { tools: listTools(context) };
    else if (rpc.method === "tools/call") {
      const params = z.object({ name: z.string(), arguments: z.unknown().optional() }).safeParse(rpc.params);
      if (!params.success) return Response.json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32602, message: "Invalid tool parameters" } });
      try { result = { content: [{ type: "text", text: JSON.stringify(await callTool(context, params.data.name, params.data.arguments ?? {})) }] }; }
      catch (error) { result = { isError: true, content: [{ type: "text", text: error instanceof ApiError ? error.message : "Internal tool error" }] }; }
    } else return Response.json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: "Method not found" } });
    return Response.json({ jsonrpc: "2.0", id: rpc.id, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
