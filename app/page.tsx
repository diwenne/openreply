import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Features } from "@/components/landing/Features";
import { Architecture } from "@/components/landing/Architecture";
import { SelfHost } from "@/components/landing/SelfHost";
import { Faq } from "@/components/landing/Faq";
import { Footer } from "@/components/landing/Footer";

function formatStars(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

async function getGitHubStars(): Promise<number | null> {
  try {
    const res = await fetch("https://api.github.com/repos/diwenne/openreply", {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const stars = await getGitHubStars();
  const starsLabel = stars !== null ? formatStars(stars) : "3.3K";

  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa] selection:bg-white/20 selection:text-white">
      <Navbar stars={starsLabel} />
      <main className="w-full">
        <Hero />
        <HowItWorks />
        <Features />
        <Architecture />
        <SelfHost />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
