/** Client-safe constants; do not import the database into client components. */
export const SERVICE_SCOPES = ["campaigns:read", "drafts:write", "events:read", "conversions:write"] as const;
