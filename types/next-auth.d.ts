import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Whether this account has TOTP enabled (proof checked separately). */
      totpEnabled?: boolean;
    } & DefaultSession["user"];
  }
}
