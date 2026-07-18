"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * Campaign Preview
 *
 * Fixed-size iPhone 17 Pro mockup that simulates how a campaign appears on
 * Instagram across three screens (Post, Comments, DM). Every screen renders in
 * the identical frame so switching tabs never resizes the phone.
 */

export type PreviewTab = "post" | "comments" | "dm";

interface CampaignPreviewProps {
  tab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
  username: string;
  avatarUrl: string | null;
  postThumb: string | null;
  caption: string;
  sampleComment: string;
  publicReplyEnabled: boolean;
  publicReplyMessage: string;
  openingDmEnabled: boolean;
  openingDmMessage: string;
  openingDmButtonLabel: string;
  revealMessage: string;
  hasLink: boolean;
  linkButtonLabel: string;
}

const SAMPLE_USER = "username";

/* ----------------------------- icons ----------------------------- */

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const Ico = {
  back: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} {...S}><path d="M15 18l-6-6 6-6" /></svg>
  ),
  heart: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} {...S}><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 10-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 000-7.8z" /></svg>
  ),
  comment: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} {...S}><path d="M21 11.5a8.4 8.4 0 01-9 8.4 9.9 9.9 0 01-4-.8L3 21l1.9-4.5A8.4 8.4 0 013 11.5 8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" /></svg>
  ),
  share: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} {...S}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
  ),
  bookmark: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} {...S}><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" /></svg>
  ),
  home: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} {...S}><path d="M3 10l9-7 9 7v9a2 2 0 01-2 2h-4v-6H9v6H5a2 2 0 01-2-2z" /></svg>
  ),
  search: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} {...S}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
  ),
  plus: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} {...S}><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M12 8v8M8 12h8" /></svg>
  ),
  reels: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} {...S}><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M3 8h18M8 3l2.5 5M14 3l2.5 5M10 12l5 3-5 3z" /></svg>
  ),
  phone: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} {...S}><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3-8.6A2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8.1 9.6a16 16 0 006 6l1.1-1.1a2 2 0 012.1-.5c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z" /></svg>
  ),
  video: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} {...S}><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10l6-3v10l-6-3z" /></svg>
  ),
  camera: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} {...S}><path d="M3 8a2 2 0 012-2h1.2a2 2 0 001.7-1l.5-.8a2 2 0 011.7-1h3.8a2 2 0 011.7 1l.5.8a2 2 0 001.7 1H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><circle cx="12" cy="13" r="3.2" /></svg>
  ),
  link: (c = "") => (
    <svg viewBox="0 0 24 24" className={c} {...S}><path d="M10.5 13.5a4 4 0 005.7 0l2.3-2.3a4 4 0 00-5.7-5.7L11.5 6.8" /><path d="M13.5 10.5a4 4 0 00-5.7 0l-2.3 2.3a4 4 0 005.7 5.7l1.3-1.3" /></svg>
  ),
};

/* ----------------------------- helpers ----------------------------- */

function renderMessage(text: string, hasLink: boolean) {
  const withName = text.replace(/\{username\}/g, SAMPLE_USER);
  return withName.split(/(\{link\})/g).map((part, i) =>
    part === "{link}" ? (
      <span key={i} className={hasLink ? "text-sky-400 underline break-all" : "text-zinc-500 italic"}>
        {hasLink ? "yourlink.com/offer" : "{link}"}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function Avatar({
  url,
  size = 28,
}: {
  url: string | null;
  size?: number;
}) {
  return url ? (
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="shrink-0 rounded-full bg-zinc-600"
      style={{ width: size, height: size }}
    />
  );
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-2.5 text-[11px] font-semibold text-white">
      <span>12:13</span>
      <div className="flex items-center gap-1">
        <svg viewBox="0 0 20 12" className="h-2.5 w-4 fill-white"><rect x="0" y="7" width="3" height="5" rx="1" /><rect x="5" y="4" width="3" height="8" rx="1" /><rect x="10" y="1.5" width="3" height="10.5" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
        <svg viewBox="0 0 20 14" className="h-3 w-4 fill-white"><path d="M10 3c2.7 0 5.2 1 7 2.7l-1.4 1.5A7.9 7.9 0 0010 5c-2.1 0-4 .8-5.6 2.2L3 5.7A10 10 0 0110 3z" /><path d="M10 8c1.3 0 2.5.5 3.4 1.3L10 12.8 6.6 9.3A5 5 0 0110 8z" /></svg>
        <svg viewBox="0 0 26 13" className="h-3 w-5"><rect x="0.5" y="0.5" width="22" height="12" rx="3" className="fill-none stroke-white/60" /><rect x="2" y="2" width="18" height="9" rx="1.5" className="fill-white" /><rect x="23.5" y="4" width="1.8" height="5" rx="1" className="fill-white/60" /></svg>
      </div>
    </div>
  );
}

function Phone({ children }: { children: React.ReactNode }) {
  const btn = "absolute w-[3px] rounded-sm bg-gradient-to-r from-zinc-500 to-zinc-700";
  return (
    <div className="relative w-[300px]">
      {/* Left side buttons: action, volume up, volume down */}
      <span className={`${btn} -left-[2px] top-[96px] h-7`} />
      <span className={`${btn} -left-[2px] top-[140px] h-12`} />
      <span className={`${btn} -left-[2px] top-[200px] h-12`} />
      {/* Right side buttons: side/power, camera control */}
      <span className={`${btn} -right-[2px] left-auto top-[150px] h-20 bg-gradient-to-l`} />
      <span className={`${btn} -right-[2px] left-auto top-[250px] h-9 bg-gradient-to-l`} />

      {/* Titanium frame → black bezel → screen */}
      <div className="relative rounded-[3rem] bg-gradient-to-br from-zinc-500 via-zinc-700 to-zinc-600 p-[3px] shadow-2xl">
        <div className="rounded-[2.85rem] bg-black p-[9px]">
          <div className="relative h-[640px] overflow-hidden rounded-[2.3rem] bg-black">
            {/* Dynamic Island */}
            <div className="absolute left-1/2 top-2 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- screens ----------------------------- */

function PostScreen({
  username,
  avatarUrl,
  postThumb,
  caption,
}: {
  username: string;
  avatarUrl: string | null;
  postThumb: string | null;
  caption: string;
}) {
  return (
    <div className="flex h-full flex-col text-white">
      <StatusBar />
      <div className="flex items-center px-3 py-2">
        <span className="w-6">{Ico.back("h-5 w-5")}</span>
        <div className="flex-1 text-center">
          <p className="text-[9px] uppercase tracking-wide text-zinc-400">{username}</p>
          <p className="text-sm font-semibold">Posts</p>
        </div>
        <span className="w-6" />
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Avatar url={avatarUrl} size={30} />
        <span className="text-sm font-semibold">{username}</span>
        <span className="ml-auto tracking-widest">···</span>
      </div>
      <div className="min-h-0 flex-1 bg-zinc-800">
        {postThumb && (
          <img src={postThumb} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4 px-3 py-2.5">
        <span className="flex items-center gap-1">{Ico.heart("h-6 w-6")}<span className="text-sm">59</span></span>
        <span className="flex items-center gap-1">{Ico.comment("h-6 w-6")}<span className="text-sm">1</span></span>
        {Ico.share("h-6 w-6")}
        <span className="ml-auto">{Ico.bookmark("h-6 w-6")}</span>
      </div>
      <div className="shrink-0 px-3 text-xs leading-relaxed">
        <p className="line-clamp-2">
          <span className="font-semibold">{username}</span>{" "}
          <span className="text-zinc-200">
            {caption || "Applications close rly soon!!"}
          </span>
        </p>
        <p className="mt-1 text-zinc-500">View all comments</p>
      </div>
      <div className="flex shrink-0 items-center justify-around border-t border-zinc-800 px-2 py-3 text-white">
        {Ico.home("h-6 w-6")}
        {Ico.search("h-6 w-6")}
        {Ico.plus("h-6 w-6")}
        {Ico.reels("h-6 w-6")}
        <Avatar url={avatarUrl} size={24} />
      </div>
    </div>
  );
}

function CommentsScreen({
  username,
  avatarUrl,
  sampleComment,
  publicReplyEnabled,
  publicReplyMessage,
}: {
  username: string;
  avatarUrl: string | null;
  sampleComment: string;
  publicReplyEnabled: boolean;
  publicReplyMessage: string;
}) {
  const reactions = ["❤️", "🙌", "🔥", "👏", "😢", "😍", "😮", "😂"];
  return (
    <div className="flex h-full flex-col text-white">
      <StatusBar />
      <div className="h-20 bg-zinc-800/70" />
      <div className="flex flex-1 flex-col rounded-t-2xl bg-[#0b0b0b] px-4 pt-3">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-zinc-600" />
        <p className="text-center text-sm font-semibold">Comments</p>

        <div className="mt-5 flex gap-3">
          <Avatar url={null} size={32} />
          <div className="flex-1">
            <p className="text-xs">
              <span className="font-semibold">{SAMPLE_USER}</span>{" "}
              <span className="text-zinc-500">Now</span>
            </p>
            <p className="text-sm">{sampleComment || "yc"}</p>
            <p className="mt-0.5 text-xs text-zinc-500">Reply</p>
          </div>
          <span className="mt-1">{Ico.heart("h-3.5 w-3.5 text-zinc-500")}</span>
        </div>

        {publicReplyEnabled && (
          <div className="mt-4 flex gap-3 pl-10">
            <Avatar url={avatarUrl} size={28} />
            <div className="flex-1">
              <p className="text-xs">
                <span className="font-semibold">{username}</span>{" "}
                <span className="text-zinc-500">Now</span>
              </p>
              <p className="text-sm">{publicReplyMessage || "Sent you a DM! 📩"}</p>
              <p className="mt-0.5 text-xs text-zinc-500">Reply</p>
            </div>
            <span className="mt-1">{Ico.heart("h-3.5 w-3.5 text-zinc-500")}</span>
          </div>
        )}

        <div className="mt-auto">
          <div className="flex items-center justify-between px-1 pb-2 text-lg">
            {reactions.map((r) => (
              <span key={r}>{r}</span>
            ))}
          </div>
          <div className="mb-3 flex items-center gap-2">
            <Avatar url={avatarUrl} size={28} />
            <div className="flex-1 rounded-full bg-zinc-800 px-3 py-2 text-xs text-zinc-500">
              Add a comment for {username}…
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DmScreen({
  username,
  avatarUrl,
  openingDmEnabled,
  openingDmMessage,
  openingDmButtonLabel,
  revealMessage,
  hasLink,
  linkButtonLabel,
}: {
  username: string;
  avatarUrl: string | null;
  openingDmEnabled: boolean;
  openingDmMessage: string;
  openingDmButtonLabel: string;
  revealMessage: string;
  hasLink: boolean;
  linkButtonLabel: string;
}) {
  return (
    <div className="flex h-full flex-col text-white">
      <StatusBar />
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="w-4">{Ico.back("h-5 w-5")}</span>
        <Avatar url={avatarUrl} size={30} />
        <span className="text-sm font-semibold">{username}</span>
        <span className="ml-auto flex items-center gap-3">
          {Ico.phone("h-5 w-5")}
          {Ico.video("h-5 w-5")}
        </span>
      </div>

      <div className="flex-1 space-y-3 px-3 py-4">
        {openingDmEnabled && (
          <>
            <div className="flex items-end gap-2">
              <Avatar url={avatarUrl} size={24} />
              <div className="max-w-[80%] overflow-hidden rounded-2xl rounded-bl-md bg-zinc-800">
                <p className="whitespace-pre-wrap px-3 py-2 text-sm">{openingDmMessage || "Your opening message…"}</p>
                <div className="mx-1.5 mb-1.5 rounded-xl bg-zinc-700 px-4 py-2.5 text-center text-sm font-medium text-white">
                  {openingDmButtonLabel || "Button label"}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <div className="rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm">
                {openingDmButtonLabel || "Button label"}
              </div>
            </div>
          </>
        )}
        {(() => {
          const resolved = revealMessage.replace(/\{username\}/g, SAMPLE_USER);
          const hasToken = resolved.includes("{link}");
          const showCard = hasLink && hasToken;
          const bodyText = showCard
            ? resolved.replace(/\s*\{link\}\s*/g, " ").trim()
            : resolved;
          return (
            <div className="flex items-end gap-2">
              <Avatar url={avatarUrl} size={24} />
              <div className="max-w-[80%] overflow-hidden rounded-2xl rounded-bl-md bg-zinc-800">
                {(!showCard || bodyText) && (
                  <p className="whitespace-pre-wrap px-3 py-2 text-sm">
                    {!revealMessage
                      ? "Write a message"
                      : showCard
                        ? bodyText
                        : renderMessage(revealMessage, hasLink)}
                  </p>
                )}
                {showCard && (
                  <div className="mx-1.5 mb-1.5 rounded-xl bg-zinc-700 px-4 py-2.5 text-center text-sm font-medium text-white">
                    {linkButtonLabel || "Open link"}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      <div className="flex items-center gap-2 px-3 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-white">
          {Ico.camera("h-4 w-4")}
        </span>
        <div className="flex-1 rounded-full bg-zinc-800 px-3 py-2 text-xs text-zinc-500">Message…</div>
      </div>
    </div>
  );
}

/* ----------------------------- root ----------------------------- */

export default function CampaignPreview(props: CampaignPreviewProps) {
  const { tab, onTabChange } = props;
  const tabs: { key: PreviewTab; label: string }[] = [
    { key: "post", label: "Post" },
    { key: "comments", label: "Comments" },
    { key: "dm", label: "DM" },
  ];

  return (
    <div className="flex flex-col items-center gap-5">
      <Phone>
        {tab === "post" && (
          <PostScreen
            username={props.username}
            avatarUrl={props.avatarUrl}
            postThumb={props.postThumb}
            caption={props.caption}
          />
        )}
        {tab === "comments" && (
          <CommentsScreen
            username={props.username}
            avatarUrl={props.avatarUrl}
            sampleComment={props.sampleComment}
            publicReplyEnabled={props.publicReplyEnabled}
            publicReplyMessage={props.publicReplyMessage}
          />
        )}
        {tab === "dm" && (
          <DmScreen
            username={props.username}
            avatarUrl={props.avatarUrl}
            openingDmEnabled={props.openingDmEnabled}
            openingDmMessage={props.openingDmMessage}
            openingDmButtonLabel={props.openingDmButtonLabel}
            revealMessage={props.revealMessage}
            hasLink={props.hasLink}
            linkButtonLabel={props.linkButtonLabel}
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
