import type { CampaignTemplate } from "@/lib/templates/campaign-templates";

interface TemplateVisualProps {
  template: CampaignTemplate;
  compact?: boolean;
}

export default function TemplateVisual({
  template,
  compact = false,
}: TemplateVisualProps) {
  return (
    <div className="border border-border p-4">
      <div className="border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Comment trigger
            </p>
            <p className="mt-1 text-sm font-bold text-white">
              {template.triggerExample}
            </p>
          </div>
          <span className="border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-zinc-300">
            {template.category}
          </span>
        </div>

        <div className={`grid gap-3 pt-4 ${compact ? "" : "sm:grid-cols-2"}`}>
          <div className="border border-white/10 bg-white/[0.035] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Keywords
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {template.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="border border-white/10 bg-white/[0.05] px-2 py-1 text-xs font-bold text-white"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
          <div className="border border-white/10 bg-white/[0.035] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Private reply
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-200">
              {template.privateReplyPreview}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
