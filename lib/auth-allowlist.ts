export function parseAuthEmailAllowlist(raw?: string): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAuthEmailAllowed(
  email: string | null | undefined,
  rawAllowlist?: string
): boolean {
  // Preserve upstream's public-signup behavior unless the self-hoster opts in
  // to a restriction. A present but malformed value fails closed.
  if (rawAllowlist === undefined || rawAllowlist === "") return true;
  if (!email) return false;

  const allowlist = parseAuthEmailAllowlist(rawAllowlist);
  return allowlist.has(email.trim().toLowerCase());
}
