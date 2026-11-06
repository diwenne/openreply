import {
  MetaApiError,
  RateLimitError,
  TokenExpiredError,
} from "@/lib/meta/client";

export class ZernioApiError extends MetaApiError {
  constructor(status: number) {
    super(
      status,
      undefined,
      undefined,
      `Zernio request failed (HTTP ${status})`
    );
    this.name = "ZernioApiError";
  }
}

export class ZernioDeliveryUnconfirmedError extends ZernioApiError {
  constructor() {
    super(502);
    this.name = "ZernioDeliveryUnconfirmedError";
    this.message =
      "Message delivery is unconfirmed. Inspect the Instagram inbox before retrying.";
  }
}

export async function zernioRequest<T>({
  apiKey,
  path,
  method = "GET",
  body,
  idempotencyKey,
}: {
  apiKey: string;
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
}): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Invalid Zernio API path");
  const response = await fetch(`https://zernio.com/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  }).catch(() => {
    throw new ZernioApiError(502);
  });
  // Responses can contain platform credentials. Only the HTTP classification is
  // safe to persist in job errors or return to the browser.
  if (!response.ok) {
    const message = `Zernio request failed (HTTP ${response.status})`;
    if (response.status === 429) throw new RateLimitError(message);
    if (response.status === 401) throw new TokenExpiredError(message);
    throw new ZernioApiError(response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json().catch(() => {
    throw new ZernioApiError(502);
  }) as Promise<T>;
}
