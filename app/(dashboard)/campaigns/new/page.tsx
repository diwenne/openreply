"use client";

/**
 * New Campaign Page
 *
 * Form to create a new campaign with goal, account, post picker, keywords, DM message, and active state.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import KeywordInput from "@/components/keyword-input";
import PostPicker from "@/components/post-picker";
import { getCampaignTemplate } from "@/lib/templates/campaign-templates";
import {
  extractFirstUrl,
  replaceUrlWithTrackedPlaceholder,
} from "@/lib/tracking/message";

export default function NewCampaignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTemplate = getCampaignTemplate(searchParams.get("template"));
  const templateDestinationUrl = selectedTemplate
    ? extractFirstUrl(selectedTemplate.dmMessage)
    : null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(selectedTemplate?.title ?? "");
  const [goal, setGoal] = useState(selectedTemplate?.goal ?? "");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [postId, setPostId] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState<string | undefined>();
  const [keywords, setKeywords] = useState<string[]>(
    selectedTemplate?.keywords ?? []
  );
  const [dmMessage, setDmMessage] = useState(
    selectedTemplate
      ? replaceUrlWithTrackedPlaceholder(
          selectedTemplate.dmMessage,
          templateDestinationUrl
        )
      : ""
  );
  const [trackedDestinationUrl, setTrackedDestinationUrl] = useState(
    templateDestinationUrl ?? ""
  );
  const [wholeWordMatch, setWholeWordMatch] = useState(true);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success) {
          const nextAccounts = payload.data.instagramAccounts ?? [];
          setAccounts(nextAccounts);
          setSelectedAccountId(
            payload.data.selectedInstagramAccountId ??
              nextAccounts[0]?.id ??
              ""
          );
        }
      })
      .catch(() => {
        setAccounts([]);
        setSelectedAccountId("");
      });
  }, []);

  function handleAccountChange(accountId: string) {
    setSelectedAccountId(accountId);
    setPostId(null);
    setPostUrl(undefined);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !goal || !postId || keywords.length === 0 || !dmMessage) {
      setError("Please fill in all required fields");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          goal,
          instagramAccountId: selectedAccountId,
          postId,
          postUrl: postUrl ?? null,
          keywords,
          dmMessage,
          trackedDestinationUrl: trackedDestinationUrl || null,
          wholeWordMatch,
          isActive,
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.push("/campaigns");
      } else {
        setError(data.error ?? "Failed to create campaign");
      }
    } catch {
      setError("Failed to create campaign");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="p-4 rounded bg-error/10 border border-error/20 text-error text-sm">
            {error}
          </div>
        )}

        {selectedTemplate && (
          <div className="border border-cyan-200/20 bg-cyan-300/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-100">
              Template loaded
            </p>
            <p className="mt-2 text-sm font-semibold text-white">
              {selectedTemplate.title}
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-300">
              Pick the Instagram post or reel, adjust the copy, and launch when
              the connection is ready.
            </p>
          </div>
        )}

        {/* Name */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Campaign Name <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Product launch link drop"
            className="w-full px-4 py-3 rounded bg-surface border border-border text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none transition-colors"
            maxLength={100}
          />
        </div>

        {/* Goal */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Campaign Goal <span className="text-error">*</span>
          </label>
          <select
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="w-full px-4 py-3 rounded bg-surface border border-border text-sm text-foreground focus:border-accent/40 focus:outline-none transition-colors"
          >
            <option value="">Select a goal</option>
            <option value="Lead magnet delivery">Lead magnet delivery</option>
            <option value="Product link request">Product link request</option>
            <option value="Price or availability reply">Price or availability reply</option>
            <option value="Launch waitlist">Launch waitlist</option>
            <option value="Agency client campaign">Agency client campaign</option>
          </select>
        </div>

        {/* Instagram Account */}
        <div className="space-y-2">
          <p className="block text-sm font-medium text-foreground">
            Instagram Account <span className="text-error">*</span>
          </p>
          {accounts.length > 0 ? (
            <AccountSelect
              accounts={accounts}
              value={selectedAccountId}
              onChange={handleAccountChange}
              includeAll={false}
              label="Connected profile"
            />
          ) : (
            <div className="rounded border border-border bg-surface px-4 py-3 text-sm text-foreground">
              Connect Instagram before launching a campaign
            </div>
          )}
        </div>

        {/* Post Picker */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Campaign Post Or Reel <span className="text-error">*</span>
          </label>
          <p className="text-xs text-muted mb-3">
            Choose which Instagram post or reel should trigger the campaign.
          </p>
          <div className="panel rounded p-4">
            <PostPicker
              selectedPostId={postId}
              instagramAccountId={selectedAccountId}
              onSelect={(id, url) => {
                setPostId(id);
                setPostUrl(url);
              }}
            />
          </div>
        </div>

        {/* Keywords */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Comment Keywords <span className="text-error">*</span>
          </label>
          <p className="text-xs text-muted mb-1">
            When someone comments any of these keywords, the campaign sends the private reply.
          </p>
          <KeywordInput keywords={keywords} onChange={setKeywords} />
        </div>

        {/* DM Message */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Private Reply Message <span className="text-error">*</span>
          </label>
          <textarea
            value={dmMessage}
            onChange={(e) => setDmMessage(e.target.value)}
            placeholder="Hey {username}! Here's the link you asked for: https://..."
            rows={4}
            className="w-full px-4 py-3 rounded bg-surface border border-border text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none transition-colors resize-none"
            maxLength={1000}
          />
          <p className="text-xs text-muted">
            Use <code className="px-1 py-0.5 rounded bg-surface-hover text-accent font-mono text-[11px]">{"{username}"}</code> to
            personalize with the commenter&apos;s name
          </p>
        </div>

        {/* Tracked Link */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Tracked Destination URL
          </label>
          <input
            type="url"
            value={trackedDestinationUrl}
            onChange={(e) => setTrackedDestinationUrl(e.target.value)}
            placeholder="https://yourlink.com/offer"
            className="w-full px-4 py-3 rounded bg-surface border border-border text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none transition-colors"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">
              Add <code className="px-1 py-0.5 rounded bg-surface-hover text-accent font-mono text-[11px]">{"{link}"}</code> to send the tracked redirect.
            </p>
            <button
              type="button"
              onClick={() =>
                setDmMessage((current) =>
                  current.includes("{link}") ? current : `${current.trim()} {link}`.trim()
                )
              }
              className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-hover hover:text-foreground"
            >
              Insert link token
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer group">
            <button
              type="button"
              onClick={() => setWholeWordMatch(!wholeWordMatch)}
              className={`
                relative w-11 h-6 rounded-full transition-colors
                ${wholeWordMatch ? "bg-accent" : "bg-zinc-700"}
              `}
            >
              <span
                className={`
                  absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm
                  ${wholeWordMatch ? "left-6" : "left-1"}
                `}
              />
            </button>
            <div>
              <span className="text-sm font-medium text-foreground">Whole word match</span>
              <p className="text-xs text-muted">
                {wholeWordMatch
                  ? '"linking" won\'t trigger "LINK"'
                  : '"linking" WILL trigger "LINK"'}
              </p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer group">
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`
                relative w-11 h-6 rounded-full transition-colors
                ${isActive ? "bg-accent" : "bg-zinc-700"}
              `}
            >
              <span
                className={`
                  absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm
                  ${isActive ? "left-6" : "left-1"}
                `}
              />
            </button>
            <div>
              <span className="text-sm font-medium text-foreground">Launch active</span>
              <p className="text-xs text-muted">
                {isActive ? "Campaign starts listening after creation" : "Campaign is saved paused"}
              </p>
            </div>
          </label>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-4 pt-4 border-t border-border">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded bg-accent text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving ? "Creating..." : "Create Campaign"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2 rounded text-sm text-muted hover:text-foreground border border-border"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
