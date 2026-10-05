"use client";

import { useCallback, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { SafeAvatar } from "@/components/ui/SafeAvatar";

/**
 * Light-weight wrapper around useSession() that exposes everything the
 * header buttons need (avatar, display name, email) and a shared dropdown
 * for the user menu so the navbar and the groups sub-page header render
 * the exact same chip + dropdown.
 */
export function useUserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);

  const displayName: string =
    (session?.user as any)?.name ??
    (session?.user as any)?.username ??
    session?.user?.email ??
    "Bạn";

  const avatar: string | null =
    (session?.user as any)?.image ??
    (session?.user as any)?.avatar ??
    null;

  const initial = displayName[0]?.toUpperCase() ?? "?";

  return { session, open, toggle, close, displayName, avatar, initial };
}

interface UserMenuButtonProps {
  open: boolean;
  onToggle: () => void;
  displayName: string;
  avatar: string | null;
  initial: string;
}

/**
 * The exact same "user chip + dropdown" rendered by both the global navbar
 * and the /groups sub-page header so the two surfaces never drift apart.
 */
export const UserMenuButton = (props: UserMenuButtonProps) => {
  const { open, onToggle, displayName, avatar, initial } = props;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 rounded-full bg-[#2a2d37] p-1"
        aria-label="Mở menu tài khoản"
        aria-pressed={open}
      >
        <div className="size-8 overflow-hidden rounded-2xl">
          <SafeAvatar
            src={avatar}
            alt=""
            name={displayName}
            className="size-full"
          />
        </div>
        <span className="pr-2 text-[13px] font-semibold text-white">{displayName}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-[#242831] bg-[#171920] py-1 shadow-xl z-50">
          <Link
            href="/profile"
            onClick={onToggle}
            className="flex items-center gap-2 px-4 py-2.5 text-[13px] text-[#94a3b8] hover:bg-white/5"
          >
            <Icon name="users2" size={14} />
            Hồ sơ của tôi
          </Link>
          <Link
            href="/friends"
            onClick={onToggle}
            className="flex items-center gap-2 px-4 py-2.5 text-[13px] text-[#94a3b8] hover:bg-white/5"
          >
            <Icon name="heartHandshake" size={14} />
            Bạn bè
          </Link>
          <Link
            href="/notifications"
            onClick={onToggle}
            className="flex items-center gap-2 px-4 py-2.5 text-[13px] text-[#94a3b8] hover:bg-white/5"
          >
            <Icon name="bellDot" size={14} />
            Thông báo
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-red-400 hover:bg-white/5"
          >
            <Icon name="logOut" size={14} />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Login button shown when the session is missing — identical on both
 * header surfaces.
 */
export const SignInButton = () => {
  return (
    <Link
      href="/auth/signin"
      className="rounded-full px-4 py-2 text-[13px] font-bold text-white"
      style={{
        backgroundImage:
          "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)",
      }}
    >
      Đăng nhập
    </Link>
  );
}
