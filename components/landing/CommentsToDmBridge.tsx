"use client";

import { useEffect, useState } from "react";

export function CommentsToDmBridge() {
  const [typedText, setTypedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sendPressed, setSendPressed] = useState(false);
  const [showUserComment, setShowUserComment] = useState(false);
  const [showAutoReply, setShowAutoReply] = useState(false);
  const [showPush, setShowPush] = useState(false);
  const [touchActive, setTouchActive] = useState(false);
  const [touchTap, setTouchTap] = useState(false);
  const [showDm, setShowDm] = useState(false);
  const [dmFadingOut, setDmFadingOut] = useState(false);
  const [commentsHidden, setCommentsHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    async function runLoop() {
      while (!cancelled) {
        setTypedText("");
        setIsTyping(false);
        setSendPressed(false);
        setShowUserComment(false);
        setShowAutoReply(false);
        setShowPush(false);
        setTouchActive(false);
        setTouchTap(false);
        setShowDm(false);
        setDmFadingOut(false);
        setCommentsHidden(false);

        await wait(1200);
        if (cancelled) break;

        setIsTyping(true);
        const word = "Repo";
        for (let i = 1; i <= word.length; i++) {
          if (cancelled) break;
          setTypedText(word.slice(0, i));
          await wait(140);
        }

        await wait(350);
        if (cancelled) break;
        setSendPressed(true);
        await wait(140);
        setSendPressed(false);

        setIsTyping(false);
        setTypedText("");
        setShowUserComment(true);

        await wait(1100);
        if (cancelled) break;
        setShowAutoReply(true);
        await wait(600);
        if (cancelled) break;
        setShowPush(true);
        await wait(700);
        if (cancelled) break;

        setTouchActive(true);
        await wait(520);
        if (cancelled) break;

        setTouchTap(true);
        await wait(160);
        setTouchTap(false);
        await wait(150);
        setTouchActive(false);

        setShowPush(false);
        setShowDm(true);

        await wait(450);
        if (cancelled) break;
        setCommentsHidden(true);
        setShowUserComment(false);
        setShowAutoReply(false);

        await wait(3350);
        if (cancelled) break;

        setDmFadingOut(true);
        setCommentsHidden(false);
        await wait(450);
        setShowDm(false);
        setDmFadingOut(false);
      }
    }

    runLoop();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-4 lg:mt-0 w-full max-w-[440px] mx-auto">
      <div className="relative w-full">
        {/* Push Notification */}
        <div
          className={`absolute -top-7 -left-2 -right-2 sm:-left-3 sm:-right-3 z-30 rounded-[24px] bg-[#252528]/85 backdrop-blur-2xl border px-3.5 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex items-center gap-3 text-left font-sans transition-all duration-400 ${
            showPush
              ? touchTap
                ? "opacity-100 translate-y-0 scale-[0.98] border-white/25"
                : "opacity-100 translate-y-0 border-white/15"
              : "opacity-0 -translate-y-4 pointer-events-none border-white/15"
          }`}
        >
          <div
            className={`pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 transition-all duration-500 ease-out z-20 ${
              touchActive
                ? touchTap
                  ? "opacity-100 translate-x-0 translate-y-0 scale-75"
                  : "opacity-100 translate-x-0 translate-y-0"
                : "opacity-0 translate-x-10 translate-y-6"
            }`}
          >
            <div
              className={`absolute inset-0 rounded-full bg-white/40 transition-all duration-300 ${
                touchTap ? "scale-150 opacity-100" : "scale-100 opacity-0"
              }`}
            />
            <div className="w-7 h-7 rounded-full bg-white/30 border border-white/60 backdrop-blur-[2px] shadow-[0_0_14px_rgba(255,255,255,0.25)]" />
          </div>

          <div className="relative w-10 h-10 rounded-[11px] bg-[#121214] border border-white/15 flex items-center justify-center shrink-0 shadow-sm">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              <path d="m9.5 12 2 2 3.5-4" />
            </svg>
            <div className="absolute -bottom-1 -right-1 w-[17px] h-[17px] rounded-[5px] bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] p-[2.5px] ring-[1.5px] ring-[#252528] flex items-center justify-center">
              <svg className="w-full h-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </div>
          </div>

          <div className="flex-1 min-w-0 leading-tight">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-semibold text-white tracking-tight truncate">openreply</span>
              <span className="text-[12px] text-[#EBEBF5]/60 shrink-0">now</span>
            </div>
            <p className="text-[13.5px] text-[#EBEBF5]/90 truncate">Sent you a message</p>
          </div>
        </div>

        {/* Phone Screen */}
        <div className="relative w-full rounded-2xl bg-[#121214] border border-white/10 shadow-[0_24px_50px_rgba(0,0,0,0.6)] overflow-hidden font-sans text-left">
          {/* Screen 2: Instagram DM */}
          <div
            className={`absolute inset-0 z-20 bg-[#000000] flex flex-col justify-between transition-all duration-500 ease-out ${
              showDm
                ? dmFadingOut
                  ? "opacity-0 translate-x-0 pointer-events-none"
                  : "opacity-100 translate-x-0"
                : "opacity-0 translate-x-full pointer-events-none"
            }`}
          >
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-white shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-[#1e1e24] border border-white/15 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      <path d="m9.5 12 2 2 3.5-4" />
                    </svg>
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#18b84e] ring-2 ring-[#000000]" />
                </div>
                <div className="leading-tight">
                  <div className="flex items-center gap-1 text-[13.5px] font-semibold text-white">
                    <span>openreply</span>
                    <svg className="w-3.5 h-3.5 fill-[#0095f6] text-[#0095f6]" viewBox="0 0 24 24">
                      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.4-1.4 2.7 2.7 6.5-6.5 1.4 1.4-7.9 7.9z" />
                    </svg>
                  </div>
                  <div className="text-[11.5px] text-[#a8a8a8] font-normal">Active now</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-white">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
            </div>

            <div className="flex-1 p-4 flex flex-col justify-end">
              <div className="flex items-end gap-2">
                <div className="w-7 h-7 rounded-full bg-[#1e1e24] border border-white/15 flex items-center justify-center shrink-0 mb-0.5">
                  <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    <path d="m9.5 12 2 2 3.5-4" />
                  </svg>
                </div>
                <div className="rounded-[20px] rounded-bl-sm bg-[#262626] p-3.5 max-w-[230px] shadow-sm space-y-2.5">
                  <p className="text-[13.5px] text-white leading-snug">hello! click below</p>
                  <a
                    href="https://github.com/diwenne/openreply"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-2 px-4 rounded-xl bg-[#363636] hover:bg-[#404040] text-center text-[13px] font-semibold text-white transition-colors"
                  >
                    open
                  </a>
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#000000]">
              <div className="flex items-center justify-between px-3 py-2 rounded-full bg-[#1a1a1a] border border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#3858f9] flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  </div>
                  <span className="text-[13px] text-[#8e8e93]">Message...</span>
                </div>
                <div className="flex items-center gap-3 text-white pr-1">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                  </svg>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Screen 1: Comments Drawer */}
          <div
            className={`w-full flex flex-col justify-between transition-all duration-500 ${
              commentsHidden ? "opacity-0 translate-y-8" : "opacity-100 translate-y-0"
            }`}
          >
            <div>
              <div className="pt-3 pb-2 flex justify-center">
                <div className="w-9 h-1 rounded-full bg-white/25" />
              </div>

              <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-center relative">
                <span className="text-[14px] font-semibold text-white">Comments</span>
              </div>

              <div className="p-4 space-y-4 text-[13px] min-h-[260px]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#1e1e24] border border-white/15 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                        <path d="m9.5 12 2 2 3.5-4" />
                      </svg>
                    </div>
                    <div className="leading-snug">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-white">openreply</span>
                        <svg className="w-3.5 h-3.5 fill-[#0095f6] text-[#0095f6]" viewBox="0 0 24 24">
                          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.4-1.4 2.7 2.7 6.5-6.5 1.4 1.4-7.9 7.9z" />
                        </svg>
                        <span className="text-[11.5px] text-[#8e8e93]">• 6w • Author</span>
                      </div>
                      <p className="text-white mt-0.5">Comment “repo” for the GitHub link</p>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-[#71717a]">
                        <span className="font-semibold text-[#a1a1aa]">Reply</span>
                        <span>See translation</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 shrink-0 pt-1">
                    <svg className="w-3.5 h-3.5 text-[#71717a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    <span className="text-[10px] text-[#71717a]">5</span>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <img src="/avatars/tirth.jpg" alt="tirth.kesharia" className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 ring-1 ring-white/10" />
                    <div className="leading-snug">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white">tirth.kesharia</span>
                        <span className="text-[11.5px] text-[#8e8e93]">6w</span>
                      </div>
                      <p className="text-white mt-0.5">Repo</p>
                      <div className="mt-1 text-[11px] text-[#71717a]">
                        <span className="font-semibold text-[#a1a1aa]">Reply</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 shrink-0 pt-1">
                    <svg className="w-3.5 h-3.5 text-[#71717a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    <span className="text-[10px] text-[#71717a]">1</span>
                  </div>
                </div>

                <div className="pl-10 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-[#1e1e24] border border-white/15 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                        <path d="m9.5 12 2 2 3.5-4" />
                      </svg>
                    </div>
                    <div className="leading-snug">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-white text-[12.5px]">openreply</span>
                        <svg className="w-3 h-3 fill-[#0095f6] text-[#0095f6]" viewBox="0 0 24 24">
                          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.4-1.4 2.7 2.7 6.5-6.5 1.4 1.4-7.9 7.9z" />
                        </svg>
                        <span className="text-[11px] text-[#8e8e93]">• 6w • Author</span>
                      </div>
                      <p className="text-white text-[12.5px] mt-0.5">
                        <span className="text-[#3897f0]">@tirth.kesharia</span> Sent you a message! Check it out!
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-[#71717a]">
                        <span className="font-semibold text-[#a1a1aa]">Reply</span>
                        <span>See translation</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 shrink-0 pt-1">
                    <svg className="w-3 h-3 text-[#71717a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    <span className="text-[10px] text-[#71717a]">1</span>
                  </div>
                </div>

                <div
                  className={`flex items-start justify-between gap-2 transition-all duration-300 ${
                    showUserComment ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <img src="/avatars/amrita.jpg" alt="_amritaaaa._" className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 ring-1 ring-white/10" />
                    <div className="leading-snug">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white">_amritaaaa._</span>
                        <span className="text-[11.5px] text-[#8e8e93]">Just now</span>
                      </div>
                      <p className="text-white mt-0.5">Repo</p>
                      <div className="mt-1 text-[11px] text-[#71717a]">
                        <span className="font-semibold text-[#a1a1aa]">Reply</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 shrink-0 pt-1">
                    <svg className="w-3.5 h-3.5 text-[#71717a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </div>
                </div>

                <div
                  className={`pl-10 flex items-start justify-between gap-2 transition-all duration-300 ${
                    showAutoReply ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-[#1e1e24] border border-white/15 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                        <path d="m9.5 12 2 2 3.5-4" />
                      </svg>
                    </div>
                    <div className="leading-snug">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-white text-[12.5px]">openreply</span>
                        <svg className="w-3 h-3 fill-[#0095f6] text-[#0095f6]" viewBox="0 0 24 24">
                          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.4-1.4 2.7 2.7 6.5-6.5 1.4 1.4-7.9 7.9z" />
                        </svg>
                        <span className="text-[11px] text-[#8e8e93]">• Just now • Author</span>
                      </div>
                      <p className="text-white text-[12.5px] mt-0.5">
                        <span className="text-[#3897f0]">@_amritaaaa._</span> Thanks! Please see DMs.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-3.5 pb-3.5 pt-2 border-t border-white/10 flex items-center gap-2.5">
              <img src="/avatars/amrita.jpg" alt="Your avatar" className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-white/15" />
              <div className="flex-1 flex items-center justify-between px-3.5 py-1.5 rounded-full bg-[#18181b] border border-white/15 text-[12px] min-h-[34px]">
                <div className="flex items-center truncate">
                  {isTyping ? (
                    <>
                      <span className="text-white font-medium">{typedText}</span>
                      <span className="inline-block w-[1.5px] h-3.5 bg-[#0095f6] ml-0.5 animate-pulse" />
                    </>
                  ) : (
                    <span className="text-[#8e8e93] truncate">Add a comment for openreply...</span>
                  )}
                </div>
                {isTyping ? (
                  <button
                    type="button"
                    aria-label="Send"
                    className={`shrink-0 ml-2 px-2.5 py-1 rounded-full bg-[#4A5DF9] text-white flex items-center justify-center transition-transform ${
                      sendPressed ? "scale-90" : ""
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-[#d4d4d8] shrink-0 ml-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                )}
              </div>
              {!isTyping && (
                <svg className="w-5 h-5 text-[#d4d4d8] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 12 20 22 4 22 4 12" />
                  <rect x="2" y="7" width="20" height="5" />
                  <line x1="12" y1="22" x2="12" y2="7" />
                  <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                  <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
