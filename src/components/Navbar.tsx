"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeaderLogo } from "@/components/HeaderLogo";
import { HeaderCluster } from "@/components/HeaderCluster";

// Top-level navigation tabs rendered in the centre of the global header.
// Hardcoded so the layout never falls back to fake / placeholder data.
//
// "Khám phá" is the dedicated reels tab (see /discover). The "Tin nhắn"
// and "Trang chủ" tabs still point at the root — chat opens the
// sliding chat column and home is the feed column.
const NAV_TABS = [
  { id: "home", label: "Trang chủ", icon: "home" as const, href: "/" },
  { id: "explore", label: "Khám phá", icon: "compass" as const, href: "/discover" },
  { id: "messages", label: "Tin nhắn", icon: "messageCircle" as const, href: "/" },
  { id: "groups", label: "Nhóm", icon: "heartHandshake" as const, href: "/groups" },
];

export function Navbar() {
  const pathname = usePathname();
  const isGroupsActive = pathname?.startsWith("/groups") ?? false;
  const isExploreActive = pathname?.startsWith("/discover") ?? false;

  return (
    <header
      className="flex h-[72px] w-full shrink-0 items-center justify-between border-b border-[#242831] bg-[#111317] px-8"
      data-surface="navbar"
    >
      <HeaderLogo />

      <nav className="flex items-center gap-8">
        {NAV_TABS.map((tab) => {
          const active =
            tab.id === "groups"
              ? isGroupsActive
              : tab.id === "explore"
                ? isExploreActive
                : tab.id === "home" && !isGroupsActive && !isExploreActive;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-bold transition-colors ${
                active
                  ? "border-[#ff2e93] text-white"
                  : "border-transparent text-[#626775] hover:text-white"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <HeaderCluster />
    </header>
  );
}