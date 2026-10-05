"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { HeaderLogo } from "@/components/HeaderLogo";
import { HeaderCluster } from "@/components/HeaderCluster";
import { useUserMenu } from "@/hooks/useUserMenu";

const secondaryTabs = [
  { label: "Feed", href: "/groups" },
  { label: "Radar", href: "/groups/radar" },
  { label: "Nhật ký", href: "/groups/diary" },
  { label: "Hộp bí mật", href: "/groups/vault" },
  { label: "Trắc nghiệm", href: "/groups/quiz" },
];

/**
 * Header for every /groups sub-page (/groups, /groups/radar, /groups/diary,
 * /groups/vault, /groups/quiz). It mirrors the global Navbar exactly — same
 * height, border, background, logo block, nav style and right-side icon
 * cluster — so users never see two different surfaces for the same app.
 *
 * The only intentional differences are:
 *   - a back-arrow next to the logo so the user has a one-click way back
 *     to the global home.
 *   - a friend-request shortcut on the right cluster (only when signed in).
 *   - the centre navigation lists the /groups sub-tabs instead of the
 *     top-level nav tabs.
 */
export function GroupsTopBar() {
  const pathname = usePathname();
  const { session } = useUserMenu();

  return (
    <header
      className="flex h-[72px] w-full shrink-0 items-center justify-between border-b border-[#242831] bg-[#111317] px-8"
      data-surface="groups-topbar"
    >
      <div className="flex items-center gap-4">
        <Link
          href="/"
          aria-label="Quay lại trang chủ"
          className="flex size-9 items-center justify-center rounded-[18px] bg-[#2a2d37] text-[#a0a5b5] hover:text-white"
          title="Quay lại trang chủ"
        >
          <Icon name="arrowLeft" size={16} />
        </Link>

        <HeaderLogo />
      </div>

      <nav className="flex items-center gap-8">
        {secondaryTabs.map((tab) => {
          const active =
            pathname === tab.href ||
            (tab.href === "/groups" && pathname === "/groups");
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`flex items-center gap-2 px-1 py-3 ${
                active
                  ? "border-b-2 border-[#ff2e93]"
                  : "border-b-2 border-transparent"
              } text-sm font-bold transition-colors ${
                active ? "text-white" : "text-[#626775] hover:text-white"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-4">
        {/* Friend request shortcut — only on /groups surfaces */}
        {session && (
          <Link
            href="/friends"
            className="relative flex size-10 items-center justify-center rounded-[20px] bg-[#2a2d37] text-[#a0a5b5] hover:text-white"
            aria-label="Lời mời kết bạn"
            title="Lời mời kết bạn"
          >
            <Icon name="heartHandshake" size={20} />
          </Link>
        )}

        {/* Shared right cluster (chat toggle + notification bell + user menu) */}
        <HeaderCluster />
      </div>
    </header>
  );
}