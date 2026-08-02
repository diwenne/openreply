import { signIn } from "@/lib/auth";
import { getCampaignTemplate } from "@/lib/templates/campaign-templates";

export const metadata = {
  title: "Login - OpenReply",
  description: "Sign in to manage Instagram comment-to-DM campaigns.",
};

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "This email is not allowed on this workspace. Use your work account, or ask the workspace owner for access.",
  OAuthAccountNotLinked:
    "This email is already registered with another sign-in method. Use the method you signed up with.",
  Verification:
    "That sign-in link is invalid or has expired. Request a new one below.",
};

function errorMessage(code?: string): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? "Sign-in failed. Please try again.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    checkEmail?: string;
    callbackUrl?: string;
    template?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const checkEmail = params.checkEmail === "1";
  const authError = errorMessage(params.error);
  const selectedTemplate = getCampaignTemplate(params.template);
  const templateCallbackUrl = selectedTemplate
    ? `/campaigns/new?template=${selectedTemplate.slug}`
    : null;
  const callbackUrl = params.callbackUrl ?? templateCallbackUrl ?? "/dashboard";
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID);

  async function signInWithGoogle() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl });
  }

  async function sendMagicLink(formData: FormData) {
    "use server";
    await signIn("resend", {
      email: String(formData.get("email") ?? ""),
      redirectTo: callbackUrl,
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground">OpenReply</h1>
          <p className="text-muted text-sm leading-relaxed mt-2">
            {selectedTemplate
              ? `Sign in to use the ${selectedTemplate.title} template.`
              : "Sign in to manage Instagram comment-to-DM campaigns."}
          </p>
        </div>

        <div className="panel rounded p-8">
          {authError && (
            <div
              role="alert"
              className="mb-5 rounded border border-error/40 bg-error/10 p-4 text-sm text-foreground"
            >
              {authError}
            </div>
          )}

          {selectedTemplate && !checkEmail && (
            <div className="mb-5 rounded border border-border bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Template selected
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {selectedTemplate.title}
              </p>
            </div>
          )}

          {checkEmail ? (
            <div className="text-center py-4">
              <h2 className="text-lg font-semibold mb-2">Check your email</h2>
              <p className="text-sm text-muted">
                We sent you a secure sign-in link. Open it on this device to
                continue.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {googleConfigured && (
                <>
                  <form action={signInWithGoogle}>
                    <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center gap-3 rounded bg-accent px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
                    >
                      <svg
                        aria-hidden="true"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M21.35 11.1H12v3.8h5.35c-.5 2.4-2.55 3.8-5.35 3.8a5.7 5.7 0 1 1 0-11.4c1.45 0 2.75.5 3.78 1.48l2.85-2.85A9.53 9.53 0 0 0 12 2.5a9.5 9.5 0 1 0 0 19c5.48 0 9.1-3.85 9.1-9.27 0-.38-.03-.76-.1-1.13Z" />
                      </svg>
                      Sign in with Google
                    </button>
                  </form>

                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs uppercase tracking-wide text-muted">
                      or
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                </>
              )}

              <form action={sendMagicLink} className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-foreground"
                  >
                    Work email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="w-full px-4 py-3 rounded bg-surface border border-border text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  className={
                    googleConfigured
                      ? "w-full inline-flex items-center justify-center rounded border border-border bg-surface px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
                      : "w-full inline-flex items-center justify-center rounded bg-accent px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
                  }
                >
                  Email me a magic link
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
