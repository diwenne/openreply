import type { Metadata } from "next";
import SeoPageShell from "@/components/seo-page-shell";
import { agenciesSeoPage } from "@/lib/seo-pages";

export const metadata: Metadata = {
  title: "Instagram DM Automation for Agencies",
  description:
    "Instagram DM automation for agencies with multi-account workspaces, comment-to-DM campaigns, tracked links, and shareable client reports.",
  alternates: { canonical: "/instagram-dm-automation-agencies" },
  openGraph: {
    title: "Instagram DM Automation for Agencies",
    description:
      "Manage client Instagram comment-to-DM campaigns with ManyChat Alternative agency workspaces.",
    url: "/instagram-dm-automation-agencies",
  },
};

export default function InstagramDmAutomationAgenciesPage() {
  return <SeoPageShell config={agenciesSeoPage} />;
}

