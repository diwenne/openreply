"use client";

/**
 * Second-factor screen: shown after a magic-link login when the account has
 * TOTP enabled and the session has no bound proof yet.
 */

import { useState } from "react";

export default function TotpPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [useBackup, setUseBackup] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        window.location.href = "/dashboard";
        return;
      }
      setError(
        res.status === 429
          ? "Too many attempts. Wait a few minutes and try again."
          : "Invalid code. Try again."
      );
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground">OpenReply</h1>
          <p className="text-muted text-sm leading-relaxed mt-2">
            Enter the code from your authenticator app to finish signing in.
          </p>
        </div>

        <div className="panel rounded p-8 shadow-black/40">
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="code"
                className="block text-sm font-medium text-foreground"
              >
                {useBackup ? "Backup code" : "Six-digit code"}
              </label>
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode={useBackup ? "text" : "numeric"}
                autoComplete="one-time-code"
                autoFocus
                required
                placeholder={useBackup ? "XXXXX-XXXXX" : "123456"}
                className="w-full px-4 py-3 rounded bg-surface border border-border text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none transition-colors tracking-widest"
              />
            </div>

            {error && <p className="text-sm text-error">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !code.trim()}
              className="w-full inline-flex items-center justify-center gap-2 rounded bg-accent px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "Checking…" : "Verify"}
            </button>

            <button
              type="button"
              onClick={() => {
                setUseBackup(!useBackup);
                setCode("");
                setError(null);
              }}
              className="w-full text-center text-xs text-muted hover:text-foreground"
            >
              {useBackup
                ? "Use my authenticator app instead"
                : "Use a backup code instead"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
