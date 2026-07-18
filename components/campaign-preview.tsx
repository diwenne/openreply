"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * Campaign Preview
 *
 * Live iPhone-style mockup of how a campaign appears on Instagram, across three
 * screens: the Post, the Comments sheet, and the DM thread. Driven entirely by
 * the builder's current state so edits reflect instantly.
 */

export type PreviewTab = "post" | "comments" | "dm";

interface CampaignPreviewProps {
  tab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
  username: string;
  postThumb: string | null;
  sampleComment: string;
  openingDmEnabled: boolean;
  openingDmMessage: string;
  openingDmButtonLabel: string;
  revealMessage: string;
  hasLink: boolean;
}

const SAMPLE_USER = "username";

function renderMessage(text: string, hasLink: boolean) {
  const withName = text.replace(/\{username\}/g, SAMPLE_USER);
  const parts = withName.split(/(\{link\})/g);
  return parts.map((part, i) =>
    part === "{link}" ? (
      <span
        key={i}
        className={
          hasLink
            ? "text-sky-400 underline break-all"
            : "text-zinc-500 italic"
        }
      >
        {hasLink ? "yourlink.com/offer" : "{link}"}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-3 pb-1 text-white text-xs font-medium">
      <span>12:13</span>
      <div className="h-1.5 w-16 rounded-full bg-white/30" />
      <span>▪▪▪ ▪</span>
    </div>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-[300px] rounded-[2.2rem] border border-zinc-700 bg-black p-1.5 shadow-xl">
      <div className="overflow-hidden rounded-[1.9rem] bg-black min-h-[560px] flex flex-col">
        {children}
      </div>
    </div>
  );
}

function PostScreen({
  username,
  postThumb,
}: {
  username: string;
  postThumb: string | null;
}) {
  return (
    <>
      <StatusBar />
      <div className="flex items-center gap-2 px-3 py-2 text-white">
        <span className="text-lg">‹</span>
        <div className="flex-1 text-center">
          <p className="text-[9px] uppercase tracking-wide text-zinc-400">
            {username}
          </p>
          <p className="text-sm font-semibold">Posts</p>
        </div>
        <span className="w-4" />
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="h-7 w-7 rounded-full bg-zinc-600" />
        <span className="text-sm font-semibold text-white">{username}</span>
        <span className="ml-auto text-white">···</span>
      </div>
      <div className="aspect-square w-full bg-zinc-800">
        {postThumb && (
          <img
            src={postThumb}
            alt="Post"
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="flex items-center gap-4 px-3 py-2 text-white">
        <span>♡ 59</span>
        <span>💬 1</span>
        <span>➤</span>
        <span className="ml-auto">🔖</span>
      </div>
      <div className="px-3 pb-3 text-xs text-zinc-300">
        <span className="font-semibold text-white">{username}</span> Tap the
        Comments tab to preview the trigger.
      </div>
    </>
  );
}

function CommentsScreen({
  username,
  sampleComment,
}: {
  username: string;
  sampleComment: string;
}) {
  return (
    <>
      <StatusBar />
      <div className="relative flex-1 bg-zinc-900">
        <div className="absolute inset-x-0 top-0 h-24 bg-zinc-800" />
        <div className="relative mt-16 rounded-t-2xl bg-black/90 px-4 pt-3 pb-4 min-h-[420px]">
          <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-zinc-600" />
          <p className="text-center text-sm font-semibold text-white">
            Comments
          </p>
          <div className="mt-5 flex gap-3">
            <div className="h-8 w-8 rounded-full bg-zinc-600" />
            <div>
              <p className="text-xs">
                <span className="font-semibold text-white">{SAMPLE_USER}</span>{" "}
                <span className="text-zinc-500">Now</span>
              </p>
              <p className="text-sm text-zinc-200">
                {sampleComment || "Leaves a comment"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">Reply</p>
            </div>
          </div>
          <div className="mt-8 flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-zinc-600" />
            <div className="flex-1 rounded-full bg-zinc-800 px-3 py-2 text-xs text-zinc-500">
              Add a comment for {username}…
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DmScreen({
  username,
  openingDmEnabled,
  openingDmMessage,
  openingDmButtonLabel,
  revealMessage,
  hasLink,
}: {
  username: string;
  openingDmEnabled: boolean;
  openingDmMessage: string;
  openingDmButtonLabel: string;
  revealMessage: string;
  hasLink: boolean;
}) {
  return (
    <>
      <StatusBar />
      <div className="flex items-center gap-2 px-3 py-2 text-white">
        <span className="text-lg">‹</span>
        <div className="h-7 w-7 rounded-full bg-zinc-600" />
        <span className="text-sm font-semibold">{username}</span>
        <span className="ml-auto">📞 🎥</span>
      </div>
      <div className="flex-1 space-y-3 px-3 py-4">
        {openingDmEnabled && (
          <>
            <div className="flex items-end gap-2">
              <div className="h-6 w-6 shrink-0 rounded-full bg-zinc-600" />
              <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-zinc-800 px-3 py-2">
                <p className="whitespace-pre-wrap text-sm text-white">
                  {openingDmMessage || "Your opening message…"}
                </p>
                <div className="mt-2 rounded-lg bg-zinc-700 py-2 text-center text-sm font-medium text-white">
                  {openingDmButtonLabel || "Button label"}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <div className="rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm text-white">
                {openingDmButtonLabel || "Button label"}
              </div>
            </div>
          </>
        )}
        <div className="flex items-end gap-2">
          <div className="h-6 w-6 shrink-0 rounded-full bg-zinc-600" />
          <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-zinc-800 px-3 py-2">
            <p className="whitespace-pre-wrap text-sm text-white">
              {revealMessage
                ? renderMessage(revealMessage, hasLink)
                : "Write a message"}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-3">
        <div className="h-7 w-7 rounded-full bg-accent" />
        <div className="flex-1 rounded-full bg-zinc-800 px-3 py-2 text-xs text-zinc-500">
          Message…
        </div>
      </div>
    </>
  );
}

export default function CampaignPreview({
  tab,
  onTabChange,
  username,
  postThumb,
  sampleComment,
  openingDmEnabled,
  openingDmMessage,
  openingDmButtonLabel,
  revealMessage,
  hasLink,
}: CampaignPreviewProps) {
  const tabs: { key: PreviewTab; label: string }[] = [
    { key: "post", label: "Post" },
    { key: "comments", label: "Comments" },
    { key: "dm", label: "DM" },
  ];

  return (
    <div className="flex flex-col items-center gap-4">
      <Phone>
        {tab === "post" && (
          <PostScreen username={username} postThumb={postThumb} />
        )}
        {tab === "comments" && (
          <CommentsScreen username={username} sampleComment={sampleComment} />
        )}
        {tab === "dm" && (
          <DmScreen
            username={username}
            openingDmEnabled={openingDmEnabled}
            openingDmMessage={openingDmMessage}
            openingDmButtonLabel={openingDmButtonLabel}
            revealMessage={revealMessage}
            hasLink={hasLink}
          />
        )}
      </Phone>

      <div className="inline-flex rounded-full bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTabChange(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              tab === t.key
                ? "bg-background font-medium text-foreground ring-1 ring-accent/40"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
