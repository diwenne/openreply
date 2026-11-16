import { ArrowUpRight } from "./ArrowUpRight";
import { CommentsToDmBridge } from "./CommentsToDmBridge";

export function Hero() {
  return (
    <section id="hero-section" className="relative w-full overflow-hidden md:min-h-[calc(100vh-3.5rem)] md:flex md:items-center">
      <div
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full opacity-25 blur-[120px]"
        style={{ background: "radial-gradient(circle, rgba(16,185,129,0.16) 0%, rgba(255,255,255,0.04) 45%, transparent 75%)" }}
        aria-hidden="true"
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16 md:pt-12 md:pb-20 grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8 lg:gap-10 items-center">
        <div className="md:col-span-6 lg:col-span-7 flex flex-col items-center text-center md:items-start md:text-left">
          <h1 className="text-4xl sm:text-5xl md:text-[44px] lg:text-[60px] font-bold text-white tracking-[-0.03em] leading-[1.03]">
            Turn Instagram comments into{" "}
            <span className="inline-block bg-gradient-to-r from-[#71717a] via-[#d4d4d8] to-white bg-clip-text text-transparent">
              private
            </span>{" "}
            <span className="inline-block bg-gradient-to-r from-[#71717a] via-[#d4d4d8] to-white bg-clip-text text-transparent">
              replies.
            </span>
          </h1>

          <p className="mt-5 text-[16px] sm:text-[17px] text-[#a1a1aa] max-w-lg leading-relaxed">
            Someone comments a keyword on your post or reel, OpenReply sends them a DM automatically. Free, open source, and self-hosted on your own infrastructure.
          </p>

          <div className="mt-8 w-full sm:w-auto flex flex-col sm:flex-row items-center justify-center md:justify-start gap-3.5">
            <a
              href="https://github.com/diwenne/openreply/blob/main/docs/setup.md"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#fafafa] hover:bg-white text-[#09090b] text-[14px] font-semibold transition-colors"
            >
              <span>Set up OpenReply</span>
              <ArrowUpRight />
            </a>

            <a
              href="#how-it-works"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#18181b] hover:bg-[#27272a] border border-white/10 text-[#fafafa] text-[14px] font-medium transition-colors"
            >
              <span>See how it works</span>
              <svg className="w-4 h-4 text-[#a1a1aa]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            </a>
          </div>

          <div className="mt-8 pt-5 border-t border-white/10 flex flex-wrap items-center justify-center md:justify-between gap-4 text-xs text-[#71717a] w-full">
            <div className="flex items-center gap-2.5">
              <span>Supported by</span>
              <a
                href="https://zernio.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center hover:opacity-85 transition-opacity"
                title="Zernio homepage"
              >
                <svg viewBox="0 0 3867 814" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-auto" aria-label="Zernio">
                  <path d="M-6.10352e-05 230.458L-0.000244141 461.78L359.783 367.324C404.618 355.553 445.318 396.864 432.88 441.519L332.554 801.71L561.96 801.71L609.501 568.36C613.469 548.882 607.541 528.703 593.669 514.466L287.32 200.054C273.062 185.42 252.341 179.041 232.321 183.12L-6.10352e-05 230.458Z" fill="#EB3514" />
                  <path d="M805.069 801.699V686.515L1099.43 295.456H829.243V177.428H1277.18V294.034L985.667 683.671H1305.62V801.699H805.069Z" fill="#EB3514" />
                  <path d="M1626.29 813.075C1532.44 813.075 1460.39 785.583 1410.14 730.597C1359.9 674.664 1334.78 593.609 1334.78 487.431C1334.78 384.096 1360.37 304.937 1411.56 249.951C1462.76 194.018 1535.28 166.052 1629.14 166.052C1718.25 166.052 1786.51 195.914 1833.91 255.64C1881.31 315.365 1905.01 402.109 1905.01 515.871V521.559H1505.42C1505.42 582.233 1516.32 628.211 1538.13 659.496C1560.88 689.833 1593.11 705.001 1634.82 705.001C1691.71 705.001 1727.73 680.353 1742.9 631.056L1896.48 643.854C1851.92 756.668 1761.86 813.075 1626.29 813.075ZM1626.29 268.438C1588.37 268.438 1558.98 281.71 1538.13 308.255C1518.22 334.799 1507.79 371.772 1506.84 419.173H1748.59C1745.74 368.928 1733.42 331.481 1711.61 306.833C1690.76 281.236 1662.32 268.438 1626.29 268.438Z" fill="#EB3514" />
                  <path d="M1968.58 801.699V323.897C1968.58 289.768 1968.1 261.328 1967.15 238.575C1966.21 215.823 1965.26 195.44 1964.31 177.428H2117.89C2118.84 184.064 2120.26 205.395 2122.16 241.419C2125 276.496 2126.42 299.723 2126.42 311.099H2127.84C2143.96 267.49 2158.18 236.679 2170.5 218.667C2182.83 200.654 2197.05 187.382 2213.17 178.85C2230.23 170.318 2251.56 166.052 2277.16 166.052C2298.01 166.052 2314.6 168.896 2326.93 174.584V309.677C2300.38 303.989 2277.63 301.145 2258.67 301.145C2217.91 301.145 2186.15 317.735 2163.39 350.916C2141.59 383.148 2130.69 431.497 2130.69 495.963V801.699H1968.58Z" fill="#EB3514" />
                  <path d="M2772.16 801.699V451.88C2772.16 341.91 2735.19 286.924 2661.24 286.924C2622.38 286.924 2590.62 303.989 2565.97 338.117C2542.27 371.298 2530.42 414.433 2530.42 467.522V801.699H2368.31V318.209C2368.31 285.028 2367.83 257.536 2366.88 235.731C2365.94 213.927 2364.99 194.492 2364.04 177.428H2517.62C2518.57 185.012 2519.99 204.92 2521.89 237.153C2524.73 268.438 2526.15 290.242 2526.15 302.567H2527.57C2549.38 255.166 2576.87 220.563 2610.05 198.758C2643.23 176.954 2682.57 166.052 2728.08 166.052C2794.44 166.052 2845.16 186.434 2880.24 227.199C2916.26 267.964 2934.27 327.689 2934.27 406.375V801.699H2772.16Z" fill="#EB3514" />
                  <path d="M3028.53 153.398V55.3259L3190.64 0V98.0722L3028.53 153.398ZM3028.53 801.699V214.312L3190.64 158.986V801.699H3028.53Z" fill="#EB3514" />
                  <path d="M3866.24 488.853C3866.24 590.291 3837.8 669.924 3780.92 727.753C3724.98 784.635 3647.72 813.075 3549.13 813.075C3451.48 813.075 3374.69 784.635 3318.76 727.753C3263.77 669.924 3236.28 590.291 3236.28 488.853C3236.28 388.363 3263.77 309.677 3318.76 252.796C3374.69 194.966 3452.43 166.052 3551.97 166.052C3653.41 166.052 3731.15 194.018 3785.18 249.951C3839.22 304.937 3866.24 384.57 3866.24 488.853ZM3695.6 488.853C3695.6 414.907 3683.27 361.344 3658.62 328.163C3634.92 294.982 3600.32 278.392 3554.81 278.392C3456.22 278.392 3406.92 348.546 3406.92 488.853C3406.92 558.058 3418.77 611.147 3442.47 648.12C3467.12 684.145 3501.73 702.157 3546.28 702.157C3645.82 702.157 3695.6 631.056 3695.6 488.853Z" fill="#EB3514" />
                </svg>
              </a>
              <span className="text-[#52525b] text-[11px]">*Optional paid provider</span>
            </div>

            <div className="font-mono text-[11px] text-[#71717a]">
              <span>MIT License</span>
            </div>
          </div>
        </div>

        <div className="md:col-span-6 lg:col-span-5 w-full">
          <CommentsToDmBridge />
        </div>
      </div>
    </section>
  );
}
