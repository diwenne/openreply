/**
 * NextAuth.js v5 — Auth Route Handler
 *
 * Uses the shared auth config from lib/auth.ts. Magic-link requests are
 * rate-limited per IP and per target email before reaching Auth.js.
 */

import { NextResponse, type NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { reserveLoginAttempt } from "@/lib/utils/login-rate-limiter";

export const { GET } = handlers;

export async function POST(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/auth/signin")) {
    const ip =
      (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
      null;

    let email: string | null = null;
    try {
      const form = await request.clone().formData();
      const raw = form.get("email");
      if (typeof raw === "string") email = raw.trim().toLowerCase();
    } catch {
      // Not form-encoded — throttle by IP alone.
    }

    const verdict = await reserveLoginAttempt(ip, email);
    if (!verdict.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(verdict.retryAfterSeconds) },
        }
      );
    }
  }

  return handlers.POST(request);
}
