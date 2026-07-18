"use client";

/**
 * Edit Campaign Page
 *
 * Loads an existing campaign and updates its editable fields via PATCH.
 * The post and connected account are fixed once a campaign is created.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import KeywordInput from "@/components/keyword-input";

interface Campaign {
  id: string;
  name: string;
  goal: string | null;
  postUrl: string | null;
  pendingNextReel: boolean;
  keywords: string[];
  dmMessage: string;
  isActive: boolean;
  wholeWordMatch: boolean;
  publicReplyEnabled: boolean;
  publicReplyMessage: string | null;
  instagramAccount: { username: string };
}

const GOALS = [
  "Lead magnet delivery",
  "Product link request",
  "Price or availability reply",
  "Launch waitlist",
  "Follower growth",
  "Agency client campaign",
];

export default function EditCampaignPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [dmMessage, setDmMessage] = useState("");
  const [wholeWordMatch, setWholeWordMatch] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [publicReplyEnabled, setPublicReplyEnabled] = useState(false);
  const [publicReplyMessage, setPublicReplyMessage] = useState("");
  const [username, setUsername] = useState("");
  const [postUrl, setPostUrl] = useState<string | null>(null);
  const [pendingNextReel, setPendingNextReel] = useState(false);

  useEffect(() => {
    fetch("/api/automations")
      .then((res) => res.json())
      .then((payload) => {
        if (!payload.success) {
          setNotFound(true);
          return;
        }
        const found = (payload.data as Campaign[]).find((c) => c.id === id);
        if (!found) {
          setNotFound(true);
          return;
        }
        setName(found.name);
        setGoal(found.goal ?? "");
        setKeywords(found.keywords);
        setDmMessage(found.dmMessage);
        setWholeWordMatch(found.wholeWordMatch);
        setIsActive(found.isActive);
        setPublicReplyEnabled(found.publicReplyEnabled);
        setPublicReplyMessage(found.publicReplyMessage ?? "");
        setUsername(found.instagramAccount.username);
        setPostUrl(found.postUrl);
        setPendingNextReel(found.pendingNextReel);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !goal || keywords.length === 0 || !dmMessage.trim()) {
      setError("Please fill in the name, goal, keywords, and reply message.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/automations?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          goal,
          keywords,
          dmMessage,
          wholeWordMatch,
          isActive,
          publicReplyEnabled,
          publicReplyMessage: publicReplyEnabled ? publicReplyMessage : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        router.push("/campaigns");
      } else {
        setError(data.error ?? "Failed to save changes");
      }
    } catch {
      setError("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="panel rounded p-8 h-40" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto panel rounded p-8 text-center">
        <p className="text-sm text-muted">Campaign not found.</p>
        <button
          onClick={() => router.push("/campaigns")}
          className="mt-4 px-4 py-2 rounded border border-border text-sm text-muted hover:text-foreground"
        >
          Back to campaigns
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="p-4 rounded bg-error/10 border border-error/20 text-error text-sm">
            {error}
          </div>
        )}

        <div className="panel rounded p-4 text-sm text-muted">
          Editing a campaign for{" "}
          <span className="text-foreground font-medium">@{username}</span>.
          {pendingNextReel && (
            <>
              {" "}
              <span className="text-amber-400 font-medium">
                Waiting for your next reel
              </span>{" "}
              — it will attach automatically once you post one.
            </>
          )}
          {postUrl && (
            <>
              {" "}
              <a
                href={postUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                View the post
              </a>
              . The post and account can&apos;t be changed after creation.
            </>
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Campaign Name <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded bg-surface border border-border text-sm text-foreground focus:border-accent/40 focus:outline-none"
            maxLength={100}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Campaign Goal <span className="text-error">*</span>
          </label>
          <select
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="w-full px-4 py-3 rounded bg-surface border border-border text-sm text-foreground focus:border-accent/40 focus:outline-none"
          >
            <option value="">Select a goal</option>
            {GOALS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Comment Keywords <span className="text-error">*</span>
          </label>
          <KeywordInput keywords={keywords} onChange={setKeywords} />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Private Reply Message <span className="text-error">*</span>
          </label>
          <textarea
            value={dmMessage}
            onChange={(e) => setDmMessage(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 rounded bg-surface border border-border text-sm text-foreground focus:border-accent/40 focus:outline-none resize-none"
            maxLength={1000}
          />
          <p className="text-xs text-muted">
            Use{" "}
            <code className="px-1 py-0.5 rounded bg-surface-hover text-accent font-mono text-[11px]">
              {"{username}"}
            </code>{" "}
            to personalize with the commenter&apos;s name.
          </p>
        </div>

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
              placeholder="Sent you a DM!"
              rows={2}
              className="w-full px-4 py-3 rounded bg-surface border border-border text-sm text-foreground focus:border-accent/40 focus:outline-none resize-none"
              maxLength={1000}
            />
          )}
        </div>

        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => setWholeWordMatch(!wholeWordMatch)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                wholeWordMatch ? "bg-accent" : "bg-zinc-700"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  wholeWordMatch ? "left-6" : "left-1"
                }`}
              />
            </button>
            <span className="text-sm font-medium text-foreground">
              Whole word match
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                isActive ? "bg-accent" : "bg-zinc-700"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  isActive ? "left-6" : "left-1"
                }`}
              />
            </button>
            <span className="text-sm font-medium text-foreground">
              {isActive ? "Active" : "Paused"}
            </span>
          </label>
        </div>

        <div className="flex items-center gap-4 pt-4 border-t border-border">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded bg-accent text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/campaigns")}
            className="px-5 py-2 rounded text-sm text-muted hover:text-foreground border border-border"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
