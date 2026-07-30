"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * Settings card: enroll a TOTP second factor. Shows the QR, confirms a first
 * code, then displays the backup codes exactly once.
 */

import { useEffect, useState } from "react";

type Step = "loading" | "disabled" | "qr" | "backup" | "enabled";

export default function TotpSetupCard() {
  const [step, setStep] = useState<Step>("loading");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/totp/status")
      .then((r) => r.json())
      .then((d) =>
        setStep(d.success && d.data.enabled ? "enabled" : "disabled")
      )
      .catch(() => setStep("disabled"));
  }, []);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/totp/setup", { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setQrDataUrl(data.data.qrDataUrl);
      setOtpauthUri(data.data.otpauthUri);
      setStep("qr");
    } catch {
      setError("Could not start enrollment. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/totp/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!data.success) {
        setError("Invalid code — scan the QR again and retry.");
        return;
      }
      setBackupCodes(data.data.backupCodes);
      setStep("backup");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel rounded p-6">
      <h2 className="text-base font-semibold text-foreground">
        Two-factor authentication
      </h2>
      <p className="mt-1 text-sm text-muted">
        A code from your authenticator app is required after every email
        sign-in.
      </p>

      {step === "loading" && (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      )}

      {step === "enabled" && (
        <p className="mt-4 text-sm font-medium text-success">
          Enabled — every new session must be confirmed with your
          authenticator.
        </p>
      )}

      {step === "disabled" && (
        <div className="mt-4">
          <button
            type="button"
            onClick={startSetup}
            disabled={busy}
            className="rounded bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Preparing…" : "Enable 2FA"}
          </button>
          {error && <p className="mt-3 text-sm text-error">{error}</p>}
        </div>
      )}

      {step === "qr" && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-foreground">
            1. Scan this QR with your authenticator app (Google Authenticator,
            Aegis, 1Password…).
          </p>
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt="TOTP enrollment QR code"
              className="rounded bg-white p-2"
              width={220}
              height={220}
            />
          )}
          {otpauthUri && (
            <p className="break-all text-xs text-muted">
              Can&rsquo;t scan? Enter this URI manually: {otpauthUri}
            </p>
          )}
          <form onSubmit={confirm} className="space-y-3">
            <label className="block text-sm text-foreground">
              2. Enter the six-digit code it shows:
            </label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              placeholder="123456"
              className="w-full max-w-xs px-4 py-2.5 rounded bg-surface border border-border text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none tracking-widest"
            />
            {error && <p className="text-sm text-error">{error}</p>}
            <button
              type="submit"
              disabled={busy || code.trim().length < 6}
              className="rounded bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? "Checking…" : "Confirm & enable"}
            </button>
          </form>
        </div>
      )}

      {step === "backup" && (
        <div className="mt-4 space-y-4">
          <p className="text-sm font-medium text-success">
            Two-factor authentication is now enabled.
          </p>
          <p className="text-sm text-foreground">
            Save these backup codes somewhere safe — they are shown only once.
            Each one signs you in a single time if you lose your authenticator.
          </p>
          <div className="grid grid-cols-2 gap-2 rounded bg-surface p-4 font-mono text-sm text-foreground">
            {backupCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStep("enabled")}
            className="rounded border border-border px-5 py-2.5 text-sm font-medium text-muted hover:text-foreground"
          >
            I saved them
          </button>
        </div>
      )}
    </section>
  );
}
