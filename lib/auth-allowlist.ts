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
  const allowlist = parseAuthEmailAllowlist(rawAllowlist);

  // Preserve upstream's public-signup behavior unless the self-hoster opts in
  // to a restriction.
  if (allowlist.size === 0) return true;
  if (!email) return false;

  return allowlist.has(email.trim().toLowerCase());
}
