import type { Metadata } from "next";
import Link from "next/link";
import PublicSiteHeader from "@/components/public-site-header";
import TemplateVisual from "@/components/template-visual";
import { CAMPAIGN_TEMPLATES } from "@/lib/templates/campaign-templates";

export const metadata: Metadata = {
  title: "Instagram Comment to DM Templates - OpenReply",
  description:
    "Copy ready-to-launch Instagram comment-to-DM campaign templates for product links, lead magnets, real estate, fitness, restaurants, events, and creators.",
  keywords: [
    "Instagram comment to DM templates",
    "comment to DM campaigns",
    "Instagram DM automation templates",
    "Manychat alternative templates",
  ],
};

export default function TemplatesPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader active="templates" />

      <section className="border-b border-white/10 bg-zinc-950/55">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-16 sm:px-6 lg:grid-cols-[0.88fr_1.12fr] lg:px-8 lg:py-20">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-cyan-200">
              Public template library
            </p>
            <h1 className="mt-4 text-5xl font-black leading-[1.02] text-white sm:text-6xl">
              Instagram campaigns you can copy in minutes
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
              Start with proven comment-to-DM playbooks for lead magnets,
              product links, events, service menus, and agency client campaigns.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center bg-cyan-300 px-6 py-3 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200"
              >
                Start free
              </Link>
              <a
                href="#template-grid"
                className="inline-flex items-center justify-center border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-bold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                Browse templates
              </a>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {CAMPAIGN_TEMPLATES.slice(0, 2).map((template) => (
              <TemplateVisual key={template.slug} template={template} compact />
            ))}
          </div>
        </div>
      </section>

      <section
        id="template-grid"
        className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-6 lg:px-8"
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {CAMPAIGN_TEMPLATES.map((template) => (
            <article
              key={template.slug}
              className="flex min-h-full flex-col border border-white/10 bg-white/[0.035] p-5 transition hover:border-white/20 hover:bg-white/[0.055]"
            >
              <div className="mb-5">
                <TemplateVisual template={template} compact />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
                {template.category}
              </p>
              <h2 className="mt-3 text-xl font-black leading-tight text-white">
                {template.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                {template.summary}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {template.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="border border-white/10 bg-zinc-950 px-2 py-1 text-xs font-semibold text-zinc-300"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
              <div className="mt-auto grid gap-2 pt-6">
                <Link
                  href={`/templates/${template.slug}`}
                  className="inline-flex w-full items-center justify-center border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
                >
                  View playbook
                </Link>
                <Link
                  href={`/login?template=${template.slug}`}
                  className="inline-flex w-full items-center justify-center bg-cyan-300 px-4 py-3 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200"
                >
                  Use this template
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
