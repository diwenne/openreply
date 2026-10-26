/** Client-safe constants; do not import the database into client components. */
export const SERVICE_SCOPES = [
  "campaigns:read",
  // Create, edit and delete campaigns. Campaigns created with a key start
  // paused, and a live campaign cannot be edited without campaigns:activate.
  "campaigns:write",
  // Turn campaigns on. Kept apart from write so a key can draft campaigns
  // without being able to start sending messages.
  "campaigns:activate",
] as const;
