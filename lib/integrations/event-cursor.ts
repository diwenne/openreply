import { ApiError } from "./http";
export type EventCursor = { time: string; id: string; until: string };
export function encodeCursor(cursor: EventCursor) { return Buffer.from(JSON.stringify(cursor)).toString("base64url"); }
export function decodeCursor(value: string | null): EventCursor | null {
  if (!value) return null;
  if (value.length > 800) throw new ApiError("Invalid cursor");
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString()) as EventCursor;
    if (typeof cursor.time !== "string" || typeof cursor.until !== "string" || typeof cursor.id !== "string" || cursor.id.length > 150 ||
      !/^([di]):[A-Za-z0-9_-]+$/.test(cursor.id) ||
      !Number.isFinite(Date.parse(cursor.time)) || !Number.isFinite(Date.parse(cursor.until))) throw new Error();
    if (new Date(cursor.time).toISOString() !== cursor.time || new Date(cursor.until).toISOString() !== cursor.until) throw new Error();
    if (Date.parse(cursor.time) > Date.parse(cursor.until) || Date.parse(cursor.until) > Date.now()) throw new Error();
    return cursor;
  } catch { throw new ApiError("Invalid cursor"); }
}
