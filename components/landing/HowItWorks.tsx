"use client";

import { useEffect, useState } from "react";

const steps = [
  {
    number: "01",
    title: "Connect your account",
    description:
      "Pick Zernio or Meta and link your Instagram Business or Creator account in seconds.",
  },
  {
    number: "02",
    title: "Set up a campaign",
    description:
      'Choose a post, add a keyword like "Repo", and write the private message you want to send.',
  },
  {
    number: "03",
    title: "OpenReply handles the rest",
    description:
      "Every time someone comments, OpenReply replies automatically and keeps track of every DM.",
  },
];

export function HowItWorks() {
  const [kwText, setKwText] = useState("");
  const [showPlaceholder, setShowPlaceholder] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const keywords = ["Repo", "Link", "Guide"];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    async function runLoop() {
      let idx = 0;
      while (!cancelled) {
        setShowPlaceholder(true);
        setKwText("");
        await sleep(900);
        if (cancelled) break;

        const word = keywords[idx % keywords.length];
        setShowPlaceholder(false);
        for (let i = 1; i <= word.length; i++) {
          if (cancelled) break;
          setKwText(word.slice(0, i));
          await sleep(110);
        }
        await sleep(1400);
        if (cancelled) break;

        for (let i = word.length - 1; i >= 0; i--) {
          if (cancelled) break;
          setKwText(word.slice(0, i));
          await sleep(65);
        }
        idx++;
      }
    }

    runLoop();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="how-it-works" className="w-full border-t border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="max-w-2xl">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-[-0.02em]">
            How it works
          </h2>
          <p className="mt-4 text-[16px] sm:text-[17px] text-[#a1a1aa] leading-relaxed">
            Send a product link, share a resource, or deliver your latest guide. You decide what starts the conversation and what happens next.
          </p>
        </div>

        <div className="relative mt-14 grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10">
          <div
            className="hidden md:block absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 z-0 pointer-events-none overflow-hidden"
            aria-hidden="true"
          >
            <div className="w-full h-px bg-white/10 mt-[0.5px]" />
            <div className="comet-beam absolute top-0 left-0 w-32 h-[2px] rounded-full bg-gradient-to-r from-transparent via-white/70 to-white shadow-[0_0_12px_rgba(255,255,255,0.65)]" />
          </div>

          <div
            className="md:hidden absolute top-0 bottom-0 left-1/2 w-[2px] -translate-x-1/2 z-0 pointer-events-none overflow-hidden"
            aria-hidden="true"
          >
            <div className="h-full w-px bg-white/10 mx-auto" />
            <div className="comet-beam-vertical absolute top-0 left-0 w-[2px] h-28 rounded-full bg-gradient-to-b from-transparent via-white/70 to-white shadow-[0_0_12px_rgba(255,255,255,0.65)]" />
          </div>

          {steps.map((step) => (
            <div
              key={step.number}
              className="relative z-10 aspect-square rounded-2xl bg-[#121214] border border-white/10 p-6 sm:p-7 flex flex-col justify-between overflow-hidden"
            >
              <div className="flex items-start justify-between">
                <span className="font-sans text-4xl sm:text-5xl font-light tracking-tight tabular-nums leading-none text-white select-none">
                  {step.number}
                </span>
              </div>

              <div className="my-auto py-3 flex items-center justify-center">
                {step.number === "01" && (
                  <div className="w-full max-w-[240px] space-y-2">
                    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#18181b] border border-white/15">
                      <div className="flex items-center gap-2.5">
                        <svg viewBox="0 0 620 814" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" aria-label="Zernio">
                          <path d="M0 230.458L0 461.78L359.783 367.324C404.618 355.553 445.318 396.864 432.88 441.519L332.554 801.71L561.96 801.71L609.501 568.36C613.469 548.882 607.541 528.703 593.669 514.466L287.32 200.054C273.062 185.42 252.341 179.041 232.321 183.12L0 230.458Z" fill="#EB3514" />
                        </svg>
                        <span className="text-[12px] font-medium text-white">Zernio</span>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#18181b]/60 border border-white/10">
                      <div className="flex items-center gap-2.5">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#0081FB] shrink-0" aria-label="Meta">
                          <path d="M16.924 5.5c-2.067 0-3.57 1.387-4.924 3.314C10.646 6.887 9.143 5.5 7.076 5.5 3.838 5.5 1.5 8.515 1.5 12.238c0 3.45 1.908 6.262 4.862 6.262 1.844 0 3.19-.942 4.656-3.175l.982-1.503.982 1.503c1.466 2.233 2.812 3.175 4.656 3.175 2.954 0 4.862-2.812 4.862-6.262C22.5 8.515 20.162 5.5 16.924 5.5zm-10.562 10.6c-1.554 0-2.562-1.646-2.562-3.862 0-2.368 1.21-4.338 3.276-4.338 1.448 0 2.473 1.073 3.744 3.058l.274.428-.996 1.522C8.748 14.962 7.772 16.1 6.362 16.1zm11.276 0c-1.41 0-2.386-1.138-3.736-3.192l-.996-1.522.274-.428c1.271-1.985 2.296-3.058 3.744-3.058 2.066 0 3.276 1.97 3.276 4.338 0 2.216-1.008 3.862-2.562 3.862z" />
                        </svg>
                        <span className="text-[12px] font-medium text-[#a1a1aa]">Meta App</span>
                      </div>
                      <span className="text-[10px] text-[#71717a]">Optional</span>
                    </div>
                  </div>
                )}

                {step.number === "02" && (
                  <div className="w-full max-w-[240px] rounded-xl bg-[#18181b] border border-white/15 px-3.5 py-2.5 flex items-center gap-2.5 shadow-sm">
                    <svg className="w-4 h-4 text-white shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
                    </svg>
                    <div className="flex items-center min-w-0 text-[13px] font-mono">
                      {!showPlaceholder && <span className="text-white font-medium">{kwText}</span>}
                      <span className="inline-block w-[1.5px] h-3.5 bg-white mr-0.5 animate-pulse" />
                      {showPlaceholder && <span className="text-[#71717a]">Keyword</span>}
                    </div>
                  </div>
                )}

                {step.number === "03" && (
                  <div className="w-full max-w-[240px] rounded-xl bg-[#18181b] border border-white/10 p-3.5 space-y-2 text-[12px]">
                    <div className="flex items-center justify-between text-[#a1a1aa]">
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                        <span>New comment</span>
                      </span>
                      <span className="text-[#71717a]">Just now</span>
                    </div>
                    <div className="flex items-center justify-between text-white">
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        <span className="font-medium">DM delivered</span>
                      </span>
                      <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              <div className="min-h-[108px] flex flex-col justify-start">
                <h3 className="text-xl font-semibold text-white tracking-tight">{step.title}</h3>
                <p className="mt-2.5 text-[14px] sm:text-[15px] text-[#a1a1aa] leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes comet-flow {
          0% {
            transform: translateX(-140px);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateX(1200px);
            opacity: 0;
          }
        }
        .comet-beam {
          animation: comet-flow 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        @keyframes comet-flow-vertical {
          0% {
            transform: translateY(-120px);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(1100px);
            opacity: 0;
          }
        }
        .comet-beam-vertical {
          animation: comet-flow-vertical 3.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </section>
  );
}
