import { notFound } from "next/navigation";
import { Suspense } from "react";
import TikTokDashboard, { TikTokConnectNotice } from "@/components/tiktok-dashboard";
import { isTikTokConfigured } from "@/lib/env";

export default function TikTokPage() {
  // TikTok is optional; without app credentials the page does not exist.
  if (!isTikTokConfigured()) notFound();

  return (
    <div className="space-y-6">
      {/* useSearchParams needs a Suspense boundary in a prerendered page. */}
      <Suspense fallback={null}>
        <TikTokConnectNotice />
      </Suspense>
      <TikTokDashboard />
    </div>
  );
}
