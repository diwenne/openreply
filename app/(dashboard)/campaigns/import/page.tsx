"use client";

/**
 * Import Campaigns Page
 *
 * Paste a CSV of automations and create them in one pass. Useful when moving
 * from another tool, since the post, keyword, and message map directly.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AccountSelect, { type AccountOption } from "@/components/account-select";

const SAMPLE = `post,keywords,dm_message,public_reply,active
https://instagram.com/reel/EXAMPLE1,"LINK,SHOP","Here you go: {link}","Sent you a DM!",true
https://instagram.com/p/EXAMPLE2,"PRICE","Our menu: {link}",,true`;

interface ImportResult {
  created: { name: string; postId: string }[];
  skipped: { line: number; post: string; reason: string }[];
}

export default function ImportCampaignsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success) {
          const next = payload.data.instagramAccounts ?? [];
          setAccounts(next);
          setSelectedAccountId(next[0]?.id ?? "");
        }
      })
      .catch(() => setAccounts([]));
  }, []);

  async function handleImport() {
    if (!selectedAccountId) {
      setError("Connect and select an Instagram account first.");
      return;
    }
    if (!csv.trim()) {
      setError("Paste your CSV first.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/automations/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagramAccountId: selectedAccountId, csv }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error ?? "Import failed");
      }
    } catch {
      setError("Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Import campaigns</h1>
        <p className="text-sm text-muted mt-1">
          Paste a CSV with one row per campaign. Required columns are{" "}
          <code className="text-accent">post</code>,{" "}
          <code className="text-accent">keywords</code>, and{" "}
          <code className="text-accent">dm_message</code>. Optional:{" "}
          <code className="text-accent">name</code>,{" "}
          <code className="text-accent">goal</code>,{" "}
          <code className="text-accent">public_reply</code>,{" "}
          <code className="text-accent">tracked_url</code>,{" "}
          <code className="text-accent">whole_word</code>,{" "}
          <code className="text-accent">active</code>. The{" "}
          <code className="text-accent">post</code> can be an Instagram URL or a
          media ID. Keywords go in one cell, separated by commas.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded bg-error/10 border border-error/20 text-error text-sm">
          {error}
        </div>
      )}

      {accounts.length > 1 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Instagram account
          </label>
          <AccountSelect
            accounts={accounts}
            value={selectedAccountId}
            onChange={setSelectedAccountId}
            includeAll={false}
            label="Account"
          />
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">CSV</label>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={SAMPLE}
          rows={12}
          className="w-full px-4 py-3 rounded bg-surface border border-border text-sm font-mono text-foreground placeholder:text-zinc-600 focus:border-accent/40 focus:outline-none resize-y"
        />
        <button
          type="button"
          onClick={() => setCsv(SAMPLE)}
          className="text-xs text-muted hover:text-foreground"
        >
          Fill with a sample
        </button>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleImport}
          disabled={busy}
          className="px-5 py-2 rounded bg-accent text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:pointer-events-none"
        >
          {busy ? "Importing..." : "Import"}
        </button>
        <button
          onClick={() => router.push("/campaigns")}
          className="px-5 py-2 rounded text-sm text-muted hover:text-foreground border border-border"
        >
          Back to campaigns
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="panel rounded p-4">
            <p className="text-sm font-medium text-foreground">
              Created {result.created.length} campaign
              {result.created.length !== 1 ? "s" : ""}
            </p>
            {result.created.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {result.created.map((c) => (
                  <li key={c.postId}>{c.name}</li>
                ))}
              </ul>
            )}
          </div>

          {result.skipped.length > 0 && (
            <div className="panel rounded p-4">
              <p className="text-sm font-medium text-foreground">
                Skipped {result.skipped.length} row
                {result.skipped.length !== 1 ? "s" : ""}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    Line {s.line}: {s.reason}
                    {s.post ? ` (${s.post})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.created.length > 0 && (
            <button
              onClick={() => router.push("/campaigns")}
              className="px-5 py-2 rounded bg-accent text-sm font-medium text-white hover:bg-accent-hover"
            >
              View campaigns
            </button>
          )}
        </div>
      )}
    </div>
  );
}
