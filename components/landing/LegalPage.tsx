import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

export function LegalPage({
  title,
  lastUpdated = "May 24, 2026",
  children,
}: {
  title: string;
  lastUpdated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-white/20 selection:text-white flex flex-col">
      <Navbar />
      <main className="w-full flex-1">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <p className="font-mono text-xs text-[#71717a]">Last updated {lastUpdated}</p>
          <h1 className="mt-3 text-3xl sm:text-4xl font-bold text-white tracking-[-0.02em]">
            {title}
          </h1>
          <div className="mt-10 space-y-8 text-[15px] text-[#a1a1aa] leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h2]:tracking-tight [&_h2]:mb-2.5 [&_a]:text-white [&_a]:underline [&_a]:underline-offset-4">
            {children}
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
