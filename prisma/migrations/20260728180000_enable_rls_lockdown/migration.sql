-- Lock down Supabase PostgREST exposure.
-- OpenReply only accesses Postgres via Prisma (server-side). It does not use
-- the Supabase anon/authenticated API. Enabling RLS with no policies for
-- anon/authenticated blocks public API access while the table owner
-- (postgres / Prisma) continues to bypass RLS.

ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Automation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DmLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FollowUp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstagramAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LinkClick" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OperationalEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcessedComment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrackedLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceMember" ENABLE ROW LEVEL SECURITY;

-- Belt-and-suspenders: revoke direct table grants from API roles.
REVOKE ALL ON TABLE "Account" FROM anon, authenticated;
REVOKE ALL ON TABLE "Automation" FROM anon, authenticated;
REVOKE ALL ON TABLE "DmLog" FROM anon, authenticated;
REVOKE ALL ON TABLE "FollowUp" FROM anon, authenticated;
REVOKE ALL ON TABLE "InstagramAccount" FROM anon, authenticated;
REVOKE ALL ON TABLE "LinkClick" FROM anon, authenticated;
REVOKE ALL ON TABLE "OperationalEvent" FROM anon, authenticated;
REVOKE ALL ON TABLE "ProcessedComment" FROM anon, authenticated;
REVOKE ALL ON TABLE "Session" FROM anon, authenticated;
REVOKE ALL ON TABLE "TrackedLink" FROM anon, authenticated;
REVOKE ALL ON TABLE "User" FROM anon, authenticated;
REVOKE ALL ON TABLE "VerificationToken" FROM anon, authenticated;
REVOKE ALL ON TABLE "WebhookEvent" FROM anon, authenticated;
REVOKE ALL ON TABLE "Workspace" FROM anon, authenticated;
REVOKE ALL ON TABLE "WorkspaceInvitation" FROM anon, authenticated;
REVOKE ALL ON TABLE "WorkspaceMember" FROM anon, authenticated;
