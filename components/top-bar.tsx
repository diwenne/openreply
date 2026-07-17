"use client";

/**
 * Top Bar
 *
 * Page title, mobile hamburger, and connection status.
 */

import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/campaigns": "Campaigns",
  "/campaigns/new": "New Campaign",
  "/automations": "Campaigns",
  "/automations/new": "New Campaign",
  "/logs": "DM Logs",
  "/settings": "Settings",
  "/diagnostics": "Diagnostics",
};

interface TopBarProps {
  onMenuClick: () => void;
  instagramUsername: string | null;
  instagramAccountCount: number;
}

export default function TopBar({
  onMenuClick,
  instagramUsername,
  instagramAccountCount,
}: TopBarProps) {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? "Dashboard";

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 lg:px-8 border-b border-border bg-background">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="lg:hidden px-2 py-1 rounded border border-border text-sm text-muted hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          Menu
        </button>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>

      <p className="text-sm text-muted">
        {instagramAccountCount > 1
          ? `${instagramAccountCount} accounts`
          : instagramUsername
            ? `@${instagramUsername}`
            : "Connect Instagram"}
      </p>
    </header>
  );
}
