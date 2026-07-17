import type { Metadata } from "next";
import SeoPageShell from "@/components/seo-page-shell";
import { manychatAlternativePage } from "@/lib/seo-pages";

export const metadata: Metadata = {
  title: "Manychat Alternative for Instagram Comment-to-DM Campaigns",
  description:
    "A focused Manychat alternative for Instagram keyword comments, private replies, tracked links, analytics, and agency client reports.",
  alternates: { canonical: "/manychat-alternative" },
  openGraph: {
    title: "Manychat Alternative for Instagram Comment-to-DM Campaigns",
    description:
      "Use ManyChat Alternative for focused Instagram comment-to-DM campaigns without a broad chatbot flow builder.",
    url: "/manychat-alternative",
  },
};

export default function ManychatAlternativePage() {
  return <SeoPageShell config={manychatAlternativePage} />;
}

