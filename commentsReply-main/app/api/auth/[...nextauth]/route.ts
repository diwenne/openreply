/**
 * NextAuth.js v5 — Auth Route Handler
 *
 * Uses the shared auth config from lib/auth.ts
 */

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
