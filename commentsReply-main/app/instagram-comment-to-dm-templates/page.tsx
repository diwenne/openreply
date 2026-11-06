import type { Metadata } from "next";
import SeoPageShell from "@/components/seo-page-shell";
import { templatesSeoPage } from "@/lib/seo-pages";

export const metadata: Metadata = {
  title: "Instagram Comment-to-DM Templates for Campaigns",
  description:
    "Browse Instagram comment-to-DM templates for lead magnets, product links, price replies, launch waitlists, creators, and agencies.",
  alternates: { canonical: "/instagram-comment-to-dm-templates" },
  openGraph: {
    title: "Instagram Comment-to-DM Templates for Campaigns",
    description:
      "Start with OpenReply templates for high-intent Instagram keyword comments and private replies.",
    url: "/instagram-comment-to-dm-templates",
  },
};

export default function InstagramCommentToDmTemplatesPage() {
  return <SeoPageShell config={templatesSeoPage} />;
}

