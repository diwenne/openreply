"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { AccountOption } from "@/components/account-select";

interface TopAccountSwitcherProps {
  initialAccounts?: AccountOption[];
  initialSelectedId?: string | null;
}

export function TopAccountSwitcher({
  initialAccounts = [],
  initialSelectedId = null,
}: TopAccountSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [accounts, setAccounts] = useState<AccountOption[]>(initialAccounts);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(initialSelectedId);
  
  // Directly derive selectedId: URL param takes precedence, falling back to internal state
  const urlAccountId = searchParams.get("instagramAccountId");
  const selectedId = urlAccountId !== null ? (urlAccountId === "all" ? null : urlAccountId) : internalSelectedId;

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch accounts if not provided or to ensure freshness
  useEffect(() => {
    if (accounts.length === 0) {
      fetch("/api/instagram/accounts")
        .then((r) => r.json())
        .then((res) => {
          if (res.success && res.data?.instagramAccounts) {
            setAccounts(res.data.instagramAccounts);
          }
        })
        .catch(() => {});
    }
  }, [accounts.length]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentAccount = accounts.find((a) => a.id === selectedId) || accounts[0];

  function handleSelect(id: string | "all") {
    const nextId = id === "all" ? null : id;
    setInternalSelectedId(nextId);
    setIsOpen(false);

    // Update query params without full reload
    const params = new URLSearchParams(searchParams.toString());
    if (id === "all") {
      params.delete("instagramAccountId");
    } else {
      params.set("instagramAccountId", id);
    }

    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`);

    // Dispatch global custom event so pages like Dashboard and Inbox can refresh immediately
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("openreply:account-switch", {
          detail: { instagramAccountId: nextId },
        })
      );
    }
  }

  if (accounts.length === 0) {
    return (
      <a
        href="/api/instagram/connect"
        className="shrink-0 whitespace-nowrap text-xs font-semibold px-3 py-1.5 rounded bg-accent text-white hover:bg-accent-hover transition-colors flex items-center gap-1.5"
      >
        <span>+</span>
        <span className="sm:hidden">Connect</span>
        <span className="hidden sm:inline">Connect Instagram</span>
      </a>
    );
  }

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-border bg-surface hover:bg-surface-hover transition-colors text-xs font-medium text-foreground cursor-pointer focus:outline-none focus:border-accent/60"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        <span className="truncate max-w-[130px] sm:max-w-[180px]">
          {selectedId && currentAccount ? `@${currentAccount.username}` : `All Accounts (${accounts.length})`}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-muted transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-60 rounded-lg border border-border bg-surface shadow-xl z-50 py-1.5 text-xs animate-fadeIn">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-muted uppercase tracking-wider border-b border-border/60 flex items-center justify-between">
            <span>Switch Instagram Brand</span>
            <span className="text-[10px] font-normal lowercase">({accounts.length} linked)</span>
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => handleSelect("all")}
              className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-surface-hover transition-colors cursor-pointer ${
                !selectedId ? "bg-accent/10 text-accent font-semibold" : "text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-muted/60" />
                <span>All Accounts (Combined View)</span>
              </div>
              {!selectedId && <span className="text-accent text-[11px]">✓</span>}
            </button>

            {accounts.map((acc) => {
              const isSelected = selectedId === acc.id;
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => handleSelect(acc.id)}
                  className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-surface-hover transition-colors cursor-pointer ${
                    isSelected ? "bg-accent/10 text-accent font-semibold" : "text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isSelected ? "bg-accent" : "bg-emerald-500"
                      }`}
                    />
                    <div className="truncate">
                      <span className="font-medium text-foreground">@{acc.username}</span>
                      {acc.name && (
                        <span className="block text-[10px] text-muted truncate">
                          {acc.name}
                        </span>
                      )}
                    </div>
                  </div>
                  {isSelected && <span className="text-accent text-[11px] shrink-0">✓</span>}
                </button>
              );
            })}
          </div>

          <div className="border-t border-border/60 pt-1 mt-1 px-1">
            <Link
              href="/settings"
              onClick={() => setIsOpen(false)}
              className="w-full px-2.5 py-1.5 rounded text-left text-muted hover:text-foreground hover:bg-surface-hover transition-colors flex items-center justify-between block cursor-pointer"
            >
              <span>+ Connect Another Account</span>
              <span className="text-muted">→</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
