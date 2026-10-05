"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

/**
 * /profile — redirects to the current user's profile page.
 * (Same behavior as Instagram / Twitter — typing just /profile in the URL bar
 * always lands on your own profile.)
 */
export default function ProfileRedirect() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      router.replace("/auth/signin");
      return;
    }
    const username = (session.user as any).username;
    if (username) router.replace(`/profile/${username}`);
    else router.replace("/auth/signin");
  }, [status, session, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0b0e] text-white">
      <div className="flex items-center gap-3 text-[#a0a5b5]">
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#ff2e93]" />
        Đang chuyển hướng...
      </div>
    </div>
  );
}
