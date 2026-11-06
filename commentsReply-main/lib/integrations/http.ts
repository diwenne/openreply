export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Bound streamed bodies too: Content-Length alone is client controlled. */
export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError("application/json required", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("Empty body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ApiError("Body too large", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError("Invalid JSON"); }
}

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(process.env.NEXTAUTH_URL ?? request.url).origin;
  if (origin !== expected) throw new ApiError("Origin not allowed", 403);
}

export function apiError(error: unknown) {
  const status = error instanceof ApiError ? error.status : 500;
  return Response.json({ error: status === 500 ? "Internal error" : (error as Error).message }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}
