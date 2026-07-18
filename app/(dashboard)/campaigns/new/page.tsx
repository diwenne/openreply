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

const DRAFT_KEY = "new-campaign-draft";

interface CampaignDraft {
  name: string;
  goal: string;
  selectedAccountId: string;
  postId: string | null;
  postUrl?: string;
  targetNextReel: boolean;
  keywords: string[];
  dmMessage: string;
  trackedDestinationUrl: string;
  wholeWordMatch: boolean;
  isActive: boolean;
  publicReplyEnabled: boolean;
  publicReplyMessage: string;
}

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
  // When true, the campaign attaches to the next reel the user posts instead
  // of an existing post.
  const [targetNextReel, setTargetNextReel] = useState(false);
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
  const [publicReplyEnabled, setPublicReplyEnabled] = useState(false);
  const [publicReplyMessage, setPublicReplyMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [attempted, setAttempted] = useState(false);

  // Live per-field validity. Red highlighting only appears after a submit
  // attempt, and clears automatically as each field is filled.
  const missing = {
    name: !name.trim(),
    goal: !goal,
    account: accounts.length === 0 || !selectedAccountId,
    post: !targetNextReel && !postId,
    keywords: keywords.length === 0,
    dmMessage: !dmMessage.trim(),
  };
  const fieldLabels: Record<keyof typeof missing, string> = {
    name: "a campaign name",
    goal: "a campaign goal",
    account: "a connected Instagram account",
    post: "a post or reel to trigger the campaign",
    keywords: "at least one comment keyword",
    dmMessage: "a private reply message",
  };
  const borderClass = (bad: boolean) =>
    attempted && bad ? "border-error" : "border-border";

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success) {
          const nextAccounts = payload.data.instagramAccounts ?? [];
          setAccounts(nextAccounts);
          // Keep a draft-restored account if one is already selected.
          setSelectedAccountId(
            (prev) =>
              prev ||
              payload.data.selectedInstagramAccountId ||
              nextAccounts[0]?.id ||
              ""
          );
        }
      })
      .catch(() => {
        setAccounts([]);
      });
  }, []);

  // Restore an in-progress draft after mount (client only, avoids hydration
  // mismatch). Reading saved form state from localStorage into React state is a
  // legitimate use of an effect, so the set-state-in-effect rule is disabled here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<CampaignDraft>;
        if (draft.name) setName(draft.name);
        if (draft.goal) setGoal(draft.goal);
        if (draft.selectedAccountId) setSelectedAccountId(draft.selectedAccountId);
        if (draft.postId) setPostId(draft.postId);
        if (draft.postUrl) setPostUrl(draft.postUrl);
        if (typeof draft.targetNextReel === "boolean")
          setTargetNextReel(draft.targetNextReel);
        if (draft.keywords?.length) setKeywords(draft.keywords);
        if (draft.dmMessage) setDmMessage(draft.dmMessage);
        if (draft.trackedDestinationUrl)
          setTrackedDestinationUrl(draft.trackedDestinationUrl);
        if (typeof draft.wholeWordMatch === "boolean")
          setWholeWordMatch(draft.wholeWordMatch);
        if (typeof draft.isActive === "boolean") setIsActive(draft.isActive);
        if (typeof draft.publicReplyEnabled === "boolean")
          setPublicReplyEnabled(draft.publicReplyEnabled);
        if (draft.publicReplyMessage)
          setPublicReplyMessage(draft.publicReplyMessage);
      }
    } catch {
      // ignore malformed draft
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist the draft so a refresh doesn't lose in-progress work.
  useEffect(() => {
    if (!hydrated) return;
    const draft: CampaignDraft = {
      name,
      goal,
      selectedAccountId,
      postId,
      postUrl,
      targetNextReel,
      keywords,
      dmMessage,
      trackedDestinationUrl,
      wholeWordMatch,
      isActive,
      publicReplyEnabled,
      publicReplyMessage,
    };
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // storage unavailable — ignore
    }
  }, [
    hydrated,
    name,
    goal,
    selectedAccountId,
    postId,
    postUrl,
    targetNextReel,
    keywords,
    dmMessage,
    trackedDestinationUrl,
    wholeWordMatch,
    isActive,
    publicReplyEnabled,
    publicReplyMessage,
  ]);

  function handleAccountChange(accountId: string) {
    setSelectedAccountId(accountId);
    setPostId(null);
    setPostUrl(undefined);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);

    const order: (keyof typeof missing)[] = [
      "name",
      "goal",
      "account",
      "post",
      "keywords",
      "dmMessage",
    ];
    const firstMissing = order.find((key) => missing[key]);
    if (firstMissing) {
      setError(`Please add ${fieldLabels[firstMissing]}.`);
      const el = document.getElementById(`field-${firstMissing}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
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
          postId: targetNextReel ? null : postId,
          postUrl: targetNextReel ? null : (postUrl ?? null),
          pendingNextReel: targetNextReel,
          keywords,
          dmMessage,
          publicReplyEnabled,
          publicReplyMessage: publicReplyEnabled ? publicReplyMessage : null,
          trackedDestinationUrl: trackedDestinationUrl || null,
          wholeWordMatch,
          isActive,
        }),
      });

      const data = await res.json();
      if (data.success) {
        try {
          window.localStorage.removeItem(DRAFT_KEY);
        } catch {
          // ignore
        }
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
        <div id="field-name" className="space-y-2 scroll-mt-24">
          <label className="block text-sm font-medium text-foreground">
            Campaign Name <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Product launch link drop"
            className={`w-full px-4 py-3 rounded bg-surface border ${borderClass(missing.name)} text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none transition-colors`}
            maxLength={100}
          />
        </div>

        {/* Goal */}
        <div id="field-goal" className="space-y-2 scroll-mt-24">
          <label className="block text-sm font-medium text-foreground">
            Campaign Goal <span className="text-error">*</span>
          </label>
          <select
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className={`w-full px-4 py-3 rounded bg-surface border ${borderClass(missing.goal)} text-sm text-foreground focus:border-accent/40 focus:outline-none transition-colors`}
          >
            <option value="">Select a goal</option>
            <option value="Lead magnet delivery">Lead magnet delivery</option>
            <option value="Product link request">Product link request</option>
            <option value="Price or availability reply">Price or availability reply</option>
            <option value="Launch waitlist">Launch waitlist</option>
            <option value="Follower growth">Follower growth</option>
            <option value="Agency client campaign">Agency client campaign</option>
          </select>
        </div>

        {/* Instagram Account */}
        <div id="field-account" className="space-y-2 scroll-mt-24">
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
            <div
              className={`rounded border ${borderClass(missing.account)} bg-surface px-4 py-3 text-sm text-foreground`}
            >
              Connect Instagram before launching a campaign
            </div>
          )}
        </div>

        {/* Post Picker */}
        <div id="field-post" className="space-y-2 scroll-mt-24">
          <label className="block text-sm font-medium text-foreground">
            Campaign Post Or Reel <span className="text-error">*</span>
          </label>
          <p className="text-xs text-muted mb-3">
            Choose an existing post, or set the campaign up now and attach it to
            the next reel you post.
          </p>

          {/* Target mode toggle */}
          <label className="flex items-center gap-3 cursor-pointer mb-3">
            <button
              type="button"
              onClick={() => setTargetNextReel(!targetNextReel)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                targetNextReel ? "bg-accent" : "bg-zinc-700"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  targetNextReel ? "left-6" : "left-1"
                }`}
              />
            </button>
            <div>
              <span className="text-sm font-medium text-foreground">
                Attach to my next posted reel
              </span>
              <p className="text-xs text-muted">
                Create the campaign now, then post your reel — it attaches
                automatically within ~15 minutes.
              </p>
            </div>
          </label>

          {targetNextReel ? (
            <div className="panel rounded p-4 border border-border text-sm text-muted">
              Waiting for your next reel. After you publish it, this campaign
              starts listening for comment keywords on that reel — no need to
              come back and pick a post.
            </div>
          ) : (
            <div className={`panel rounded p-4 border ${borderClass(missing.post)}`}>
              <PostPicker
                selectedPostId={postId}
                instagramAccountId={selectedAccountId}
                onSelect={(id, url) => {
                  setPostId(id);
                  setPostUrl(url);
                }}
              />
            </div>
          )}
        </div>

        {/* Keywords */}
        <div id="field-keywords" className="space-y-2 scroll-mt-24">
          <label className="block text-sm font-medium text-foreground">
            Comment Keywords <span className="text-error">*</span>
          </label>
          <p className="text-xs text-muted mb-1">
            When someone comments any of these keywords, the campaign sends the private reply.
          </p>
          <div className={attempted && missing.keywords ? "rounded border border-error" : ""}>
            <KeywordInput keywords={keywords} onChange={setKeywords} />
          </div>
        </div>

        {/* DM Message */}
        <div id="field-dmMessage" className="space-y-2 scroll-mt-24">
          <label className="block text-sm font-medium text-foreground">
            Private Reply Message <span className="text-error">*</span>
          </label>
          <textarea
            value={dmMessage}
            onChange={(e) => setDmMessage(e.target.value)}
            placeholder="Hey {username}! Here's the link you asked for: https://..."
            rows={4}
            className={`w-full px-4 py-3 rounded bg-surface border ${borderClass(missing.dmMessage)} text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none transition-colors resize-none`}
            maxLength={1000}
          />
          <p className="text-xs text-muted">
            Use <code className="px-1 py-0.5 rounded bg-surface-hover text-accent font-mono text-[11px]">{"{username}"}</code> to
            personalize with the commenter&apos;s name
          </p>
        </div>

        {/* Public comment reply */}
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => setPublicReplyEnabled(!publicReplyEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                publicReplyEnabled ? "bg-accent" : "bg-zinc-700"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  publicReplyEnabled ? "left-6" : "left-1"
                }`}
              />
            </button>
            <div>
              <span className="text-sm font-medium text-foreground">
                Also reply to the comment publicly
              </span>
              <p className="text-xs text-muted">
                Posts a visible reply under the comment, on top of the DM.
              </p>
            </div>
          </label>
          {publicReplyEnabled && (
            <textarea
              value={publicReplyMessage}
              onChange={(e) => setPublicReplyMessage(e.target.value)}
              placeholder="Sent you a DM! 📩"
              rows={2}
              className="w-full px-4 py-3 rounded bg-surface border border-border text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none transition-colors resize-none"
              maxLength={1000}
            />
          )}
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
