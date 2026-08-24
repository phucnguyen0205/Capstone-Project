"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

const secondaryTabs = [
  { label: "Feed", href: "/groups" },
  { label: "Radar", href: "/groups/radar" },
  { label: "Nhật ký", href: "/groups/diary" },
  { label: "Hộp bí mật", href: "/groups/vault" },
  { label: "Trắc nghiệm", href: "/groups/quiz" },
];

const navTabs = [
  { id: "home", label: "Trang chủ", href: "/" },
  { id: "explore", label: "Khám phá", href: "/" },
  { id: "messages", label: "Tin nhắn", href: "/" },
  { id: "groups", label: "Nhóm", href: "/groups" },
];

export function GroupsTopBar() {
  const pathname = usePathname();

  return (
    <header className="flex h-[60px] w-full shrink-0 items-center justify-between border-b border-[#232338] bg-[#0c0c14] px-6">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          aria-label="Quay lại"
          className="flex size-8 items-center justify-center rounded-2xl bg-white/5 hover:bg-white/10"
        >
          <Icon name="arrowLeft" size={16} />
        </Link>

        <Link href="/" className="flex items-center gap-2">
          <div
            className="flex size-9 items-center justify-center rounded-[18px]"
            style={{
              backgroundImage:
                "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
            }}
          >
            <Icon name="zap" size={20} />
          </div>
          <p className="text-[22px] font-extrabold text-white">
            Name
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(14deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
              }}
            >
              App
            </span>
          </p>
        </Link>
      </div>

      <nav className="flex items-center gap-1">
        {secondaryTabs.map((tab) => {
          const active =
            pathname === tab.href ||
            (tab.href === "/groups" && pathname.startsWith("/groups"));
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`rounded-lg px-4 py-2 text-sm transition-colors ${
                active
                  ? "bg-[#161629] font-semibold text-[#00f2fe]"
                  : "font-medium text-[#94a3b8] hover:text-white"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="relative flex size-9 items-center justify-center rounded-[18px] bg-white/5"
          aria-label="Thông báo"
        >
          <Icon name="bellDot" size={18} />
          <span className="absolute right-2.5 top-2.5 size-1.5">
            <Icon name="ellipse" size={6} />
          </span>
        </button>

        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-[#f1f1f7]">Minh</span>
          <div className="relative size-8 overflow-hidden rounded-2xl border border-[#232338]">
            <img
              src="/assets/avatar-minh.png"
              alt="Minh"
              className="size-full object-cover"
            />
            <span className="absolute bottom-0 right-0 size-2.5">
              <Icon name="onlineIndicator" size={10} />
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}