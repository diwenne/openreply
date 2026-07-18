"use client";

/**
 * Import Campaigns Page
 *
 * Paste a CSV of everything except the post, then assign each row to a reel
 * by clicking its thumbnail. Useful when moving from another tool: the
 * keyword and message come from a spreadsheet, the post is picked visually.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import { parseCsv } from "@/lib/utils/csv";

const SAMPLE = `keywords,dm_message,public_reply,tracked_url
"yc","hey there! here it is: {link}","sent. check dms","https://events.ycombinator.com/startup-school-2026"
"LINK,SHOP","grab it here: {link}","dmed u",`;

interface ParsedRow {
  keywords: string[];
  dmMessage: string;
  name: string;
  goal: string;
  publicReply: string;
  trackedUrl: string;
  wholeWord: boolean;
  active: boolean;
}

interface Post {
  id: string;
  permalink?: string;
  thumbnail?: string;
}

interface Assignment {
  postId: string;
  postUrl?: string;
  thumbnail?: string;
}

interface ImportResult {
  created: { name: string; postId: string }[];
  skipped: { row: number; reason: string }[];
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (!value || value.trim() === "") return fallback;
  return /^(true|yes|1|active|on)$/i.test(value.trim());
}

export default function ImportCampaignsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [assignments, setAssignments] = useState<Record<number, Assignment>>({});
  const [pickerRow, setPickerRow] = useState<number | null>(null);
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

  useEffect(() => {
    if (!selectedAccountId) return;
    fetch(`/api/instagram/posts?instagramAccountId=${selectedAccountId}&limit=50`)
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success) {
          setPosts(
            (payload.data as { id: string; permalink?: string; thumbnail_url?: string; media_url?: string }[]).map(
              (p) => ({
                id: p.id,
                permalink: p.permalink,
                thumbnail: p.thumbnail_url ?? p.media_url,
              })
            )
          );
        }
      })
      .catch(() => setPosts([]));
  }, [selectedAccountId]);

  function parseRows() {
    setError(null);
    const parsed = parseCsv(csv);
    if (parsed.length === 0) {
      setError("Paste a CSV with a header row and at least one campaign.");
      return;
    }
    const next: ParsedRow[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const r = parsed[i];
      const keywords = (r.keywords ?? "")
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 10);
      const dmMessage = (r.dm_message ?? r.message ?? "").trim();
      if (keywords.length === 0 || !dmMessage) {
        setError(`Row ${i + 1} is missing keywords or a message.`);
        return;
      }
      next.push({
        keywords,
        dmMessage,
        name: (r.name ?? "").trim(),
        goal: (r.goal ?? "").trim(),
        publicReply: (r.public_reply ?? "").trim(),
        trackedUrl: (r.tracked_url ?? "").trim(),
        wholeWord: parseBool(r.whole_word, true),
        active: parseBool(r.active, true),
      });
    }
    setRows(next);
    setAssignments({});
    setResult(null);
  }

  function assignPost(post: Post) {
    if (pickerRow === null) return;
    setAssignments((prev) => ({
      ...prev,
      [pickerRow]: {
        postId: post.id,
        postUrl: post.permalink,
        thumbnail: post.thumbnail,
      },
    }));
    setPickerRow(null);
  }

  const allAssigned =
    rows !== null && rows.every((_, i) => assignments[i]?.postId);

  async function handleImport() {
    if (!rows || !allAssigned) return;
    setBusy(true);
    setError(null);
    try {
      const campaigns = rows.map((r, i) => ({
        postId: assignments[i].postId,
        postUrl: assignments[i].postUrl ?? null,
        keywords: r.keywords,
        dmMessage: r.dmMessage,
        name: r.name || null,
        goal: r.goal || null,
        publicReplyMessage: r.publicReply || null,
        trackedUrl: r.trackedUrl || null,
        wholeWordMatch: r.wholeWord,
        isActive: r.active,
      }));
      const res = await fetch("/api/automations/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagramAccountId: selectedAccountId, campaigns }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
        setRows(null);
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
          Paste a CSV with one row per campaign, then pick the reel for each
          row from your posts. Required columns are{" "}
          <code className="text-accent">keywords</code> and{" "}
          <code className="text-accent">dm_message</code>. Optional:{" "}
          <code className="text-accent">name</code>,{" "}
          <code className="text-accent">goal</code>,{" "}
          <code className="text-accent">public_reply</code>,{" "}
          <code className="text-accent">tracked_url</code>,{" "}
          <code className="text-accent">whole_word</code>,{" "}
          <code className="text-accent">active</code>. Keywords go in one cell,
          separated by commas. Use{" "}
          <code className="text-accent">{"{link}"}</code> in the message to
          insert the tracked link.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded bg-error/10 border border-error/20 text-error text-sm">
          {error}
        </div>
      )}

      {accounts.length > 1 && !rows && (
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

      {/* Step 1: paste CSV */}
      {!rows && !result && (
        <>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">CSV</label>
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={SAMPLE}
              rows={10}
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
              onClick={parseRows}
              className="px-5 py-2 rounded bg-accent text-sm font-medium text-white hover:bg-accent-hover"
            >
              Continue
            </button>
            <button
              onClick={() => router.push("/campaigns")}
              className="px-5 py-2 rounded text-sm text-muted hover:text-foreground border border-border"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Step 2: assign a reel to each row */}
      {rows && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Assign a reel to each campaign. {Object.keys(assignments).length} of{" "}
            {rows.length} assigned.
          </p>
          {rows.map((row, i) => {
            const a = assignments[i];
            return (
              <div key={i} className="panel rounded p-4 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setPickerRow(i)}
                  className="shrink-0"
                >
                  {a?.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.thumbnail}
                      alt="Selected reel"
                      className="w-16 h-16 rounded object-cover border-2 border-accent"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded border border-dashed border-border flex items-center justify-center text-xs text-muted">
                      Pick reel
                    </div>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1 mb-1">
                    {row.keywords.map((k) => (
                      <span
                        key={k}
                        className="px-2 py-0.5 rounded bg-surface-hover text-xs text-foreground"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-muted truncate">{row.dmMessage}</p>
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={handleImport}
              disabled={!allAssigned || busy}
              className="px-5 py-2 rounded bg-accent text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy
                ? "Importing..."
                : `Import ${rows.length} campaign${rows.length !== 1 ? "s" : ""}`}
            </button>
            <button
              onClick={() => {
                setRows(null);
                setAssignments({});
              }}
              className="px-5 py-2 rounded text-sm text-muted hover:text-foreground border border-border"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="panel rounded p-4">
            <p className="text-sm font-medium text-foreground">
              Created {result.created.length} campaign
              {result.created.length !== 1 ? "s" : ""}
            </p>
          </div>
          {result.skipped.length > 0 && (
            <div className="panel rounded p-4">
              <p className="text-sm font-medium text-foreground">
                Skipped {result.skipped.length}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    Row {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            onClick={() => router.push("/campaigns")}
            className="px-5 py-2 rounded bg-accent text-sm font-medium text-white hover:bg-accent-hover"
          >
            View campaigns
          </button>
        </div>
      )}

      {/* Reel picker modal */}
      {pickerRow !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPickerRow(null)}
        >
          <div
            className="bg-surface border border-border rounded p-4 max-w-lg w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Pick a reel</h2>
              <button
                onClick={() => setPickerRow(null)}
                className="text-sm text-muted hover:text-foreground"
              >
                Close
              </button>
            </div>
            {posts.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">
                No posts loaded for this account.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {posts.map((post) => (
                  <button
                    key={post.id}
                    onClick={() => assignPost(post)}
                    className="aspect-square rounded overflow-hidden border border-border hover:border-accent"
                  >
                    {post.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.thumbnail}
                        alt="Post"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-surface-hover" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
