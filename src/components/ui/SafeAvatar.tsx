"use client";

import { useState, useMemo } from "react";
import { proxyAvatar } from "@/lib/avatar";

/**
 * Drop-in replacement for raw <img> avatar tags.
 *
 * Two protections against Google's avatar CDN rate limit (429):
 *
 *   1. Routed through `/api/avatar?url=...` so the browser can
 *      aggressively cache the response (7 days, immutable) and
 *      re-renders don't refetch.
 *
 *   2. Falls back to a coloured gradient with the user's first
 *      initial whenever the upstream returns an error — that way a
 *      single 429 on one user doesn't break the whole layout, and the
 *      user still sees a recognisable avatar instead of a broken
 *      image icon.
 *
 * Props mirror the parts of <img> the codebase actually uses.
 */
export interface SafeAvatarProps {
  src: string | null | undefined;
  alt?: string;
  name?: string | null | undefined;
  username?: string | null | undefined;
  className?: string;
  imgClassName?: string;
  loading?: "eager" | "lazy";
}

function initial(name?: string | null, username?: string | null): string {
  const source = (name ?? username ?? "").trim();
  return source[0]?.toUpperCase() ?? "?";
}

export function SafeAvatar({
  src,
  alt = "",
  name,
  username,
  className = "",
  imgClassName = "size-full object-cover",
  loading = "lazy",
}: SafeAvatarProps) {
  const [errored, setErrored] = useState(false);
  const finalSrc = useMemo(() => proxyAvatar(src), [src]);

  // No source OR previously errored → render the gradient + initial
  // fallback. Returning the same container keeps the surrounding
  // grid/flex layout stable.
  if (!finalSrc || errored) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-violet-500 to-teal-500 text-[10px] font-bold text-white">
          {initial(name, username)}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={finalSrc}
        alt={alt}
        loading={loading}
        referrerPolicy="no-referrer"
        onError={() => setErrored(true)}
        className={imgClassName}
      />
    </div>
  );
}