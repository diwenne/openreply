import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PublicSiteHeader from "@/components/public-site-header";
import TemplateVisual from "@/components/template-visual";
import {
  CAMPAIGN_TEMPLATES,
  getCampaignTemplate,
  getCampaignTemplateSlugs,
} from "@/lib/templates/campaign-templates";

type TemplatePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getCampaignTemplateSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: TemplatePageProps): Promise<Metadata> {
  const { slug } = await params;
  const template = getCampaignTemplate(slug);

  if (!template) {
    return {
      title: "Template Not Found - OpenReply",
    };
  }

  return {
    title: `${template.title} - Instagram Comment to DM Template`,
    description: template.summary,
    keywords: [
      `${template.title} template`,
      "Instagram comment to DM template",
      "Instagram DM campaign template",
      template.category,
      template.audience,
    ],
  };
}

export default async function TemplateDetailPage({ params }: TemplatePageProps) {
  const { slug } = await params;
  const template = getCampaignTemplate(slug);

  if (!template) {
    notFound();
  }

  const relatedTemplates = CAMPAIGN_TEMPLATES.filter(
    (item) => item.slug !== template.slug
  ).slice(0, 3);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader active="templates" />

      <section className="border-b border-white/10 bg-zinc-950/55">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-20">
          <div>
            <Link
              href="/templates"
              className="text-sm font-semibold text-zinc-400 transition hover:text-white"
            >
              Back to templates
            </Link>
            <p className="mt-8 text-sm font-bold uppercase tracking-wide text-cyan-200">
              {template.category} template
            </p>
            <h1 className="mt-4 text-5xl font-black leading-[1.02] text-white sm:text-6xl">
              {template.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
              {template.summary}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/login?template=${template.slug}`}
                className="inline-flex items-center justify-center bg-cyan-300 px-6 py-3 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200"
              >
                Use this template
              </Link>
              <a
                href="#playbook"
                className="inline-flex items-center justify-center border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-bold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                Read playbook
              </a>
            </div>
          </div>

          <TemplateVisual template={template} />
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-16 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8">
        <aside className="space-y-4">
          <div className="border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Audience
            </p>
            <p className="mt-2 text-lg font-bold text-white">{template.audience}</p>
          </div>
          <div className="border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Setup time
            </p>
            <p className="mt-2 text-lg font-bold text-white">
              {template.setupMinutes} minutes
            </p>
          </div>
          <div className="border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Campaign goal
            </p>
            <p className="mt-2 text-lg font-bold text-white">{template.goal}</p>
          </div>
        </aside>

        <div id="playbook" className="space-y-8">
          <section className="border border-white/10 bg-white/[0.035] p-6">
            <h2 className="text-2xl font-black text-white">Campaign Outcome</h2>
            <p className="mt-3 text-base leading-8 text-zinc-300">
              {template.outcome}
            </p>
          </section>

          <section className="border border-white/10 bg-white/[0.035] p-6">
            <h2 className="text-2xl font-black text-white">Setup Playbook</h2>
            <ol className="mt-5 space-y-3">
              {template.playbook.map((step, index) => (
                <li key={step} className="grid gap-3 sm:grid-cols-[40px_1fr]">
                  <span className="flex h-8 w-8 items-center justify-center bg-cyan-300 text-sm font-black text-zinc-950">
                    {index + 1}
                  </span>
                  <span className="text-sm leading-7 text-zinc-300">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="border border-white/10 bg-white/[0.035] p-6">
              <h2 className="text-xl font-black text-white">Best For</h2>
              <ul className="mt-4 space-y-2">
                {template.bestFor.map((item) => (
                  <li key={item} className="text-sm text-zinc-300">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-white/10 bg-white/[0.035] p-6">
              <h2 className="text-xl font-black text-white">Metrics To Watch</h2>
              <ul className="mt-4 space-y-2">
                {template.metrics.map((item) => (
                  <li key={item} className="text-sm text-zinc-300">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="border border-cyan-200/20 bg-cyan-300/10 p-6">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h2 className="text-2xl font-black text-white">
                  Copy this campaign into OpenReply
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Sign in, connect Instagram, pick a post or reel, and the
                  template copy will be ready for your campaign draft.
                </p>
              </div>
              <Link
                href={`/login?template=${template.slug}`}
                className="inline-flex items-center justify-center bg-cyan-300 px-6 py-3 text-sm font-bold text-zinc-950 transition hover:bg-cyan-200"
              >
                Use this template
              </Link>
            </div>
          </section>
        </div>
      </section>

      <section className="border-t border-white/10 bg-zinc-950/60 py-14">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-black text-white">More templates</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {relatedTemplates.map((item) => (
              <Link
                key={item.slug}
                href={`/templates/${item.slug}`}
                className="border border-white/10 bg-white/[0.035] p-5 transition hover:border-white/20 hover:bg-white/[0.055]"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
                  {item.category}
                </p>
                <h3 className="mt-3 text-lg font-black text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {item.summary}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
