import type { Metadata } from "next";
import SeoPageShell from "@/components/seo-page-shell";
import { commentLinkSeoPage } from "@/lib/seo-pages";

export const metadata: Metadata = {
  title: "Comment LINK Automation for Instagram",
  description:
    "Automate Instagram comment LINK replies with keyword matching, Meta-compliant private replies, tracked links, and campaign analytics.",
  alternates: { canonical: "/comment-link-automation" },
  openGraph: {
    title: "Comment LINK Automation for Instagram",
    description:
      "Turn LINK, SHOP, GUIDE, and PRICE comments into tracked private replies with OpenReply.",
    url: "/comment-link-automation",
  },
};

export default function CommentLinkAutomationPage() {
  return <SeoPageShell config={commentLinkSeoPage} />;
}

