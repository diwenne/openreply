import { safeDeliveryError } from "@/lib/campaigns/history";

/** Explicit dashboard projection: never include account credentials, recipient
 * identifiers, operation keys or raw provider/queue payloads. */
export const deliveryHistorySelect = {
  id: true, stage: true, status: true, campaignVersion: true, message: true,
  error: true, attempts: true, scheduledAt: true, claimedAt: true, sentAt: true,
  createdAt: true, updatedAt: true,
} as const;

export function safeDeliveryHistory(event: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const field of Object.keys(deliveryHistorySelect)) data[field] = event[field];
  data.error = safeDeliveryError(typeof event.error === "string" ? event.error : null);
  return data;
}
