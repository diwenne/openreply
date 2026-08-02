export function parseAuthEmailAllowlist(raw?: string): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function parseAuthDomainAllowlist(raw?: string): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
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

export function isAuthDomainAllowed(
  email: string | null | undefined,
  rawDomains?: string
): boolean {
  if (rawDomains === undefined || rawDomains === "") return true;
  if (!email) return false;

  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  if (!domain) return false;

  return parseAuthDomainAllowlist(rawDomains).has(domain);
}

/**
 * Combined sign-in gate. With neither list configured, public signup is
 * preserved (upstream behavior). With at least one configured, an email must
 * match the explicit address list OR the domain list; a present-but-blank
 * value keeps failing closed, matching the historical email-list semantics.
 */
export function isAuthSignInAllowed(
  email: string | null | undefined,
  rawEmailAllowlist?: string,
  rawDomainAllowlist?: string
): boolean {
  const emailsUnset = rawEmailAllowlist === undefined || rawEmailAllowlist === "";
  const domainsUnset = rawDomainAllowlist === undefined || rawDomainAllowlist === "";

  if (emailsUnset && domainsUnset) return true;
  if (!email) return false;

  const byEmail = !emailsUnset && isAuthEmailAllowed(email, rawEmailAllowlist);
  const byDomain = !domainsUnset && isAuthDomainAllowed(email, rawDomainAllowlist);

  return byEmail || byDomain;
}
