/**
 * Resolve a user avatar URL to a same-origin proxied URL when the
 * upstream is Google (rate-limited CDN) or Cloudinary (so we can
 * inject size/quality transforms).
 *
 * Returning `/api/avatar?url=...` instead of the raw remote URL:
 *   1. Lets the browser cache the avatar across re-renders
 *      (Cache-Control: public, max-age=7d, immutable).
 *   2. Lets Next.js server-side dedupe bursts so the upstream gets a
 *      single fetch per URL per 5-minute window.
 *   3. Avoids 429s from lh3.googleusercontent.com when a single
 *      screen renders dozens of avatars at once.
 *   4. Lets the proxy upgrade the source resolution (Google `=s96-c`
 *      → `=s1024-c1024`, Cloudinary gets a `w_1024,h_1024,c_scale,
 *      q_90,f_auto` transform, Unsplash gets `?w=1024&h=1024&fit=
 *      crop&q=90&fm=auto`) so the avatar stays sharp when displayed
 *      as a full-bleed card background on retina.
 *
 * Pure on the client too — callers can use it inside a useMemo / render
 * without needing the request URL.
 */
export function proxyAvatar(url: string | null | undefined): string | null {
  if (!url) return null;

  // Already same-origin (data URI, relative path, or our own upload
  // route) — no need to re-proxy.
  if (url.startsWith("/") || url.startsWith("data:")) return url;

  // Detect the upstreams we proxy so we can both cache + bump their
  // resolution. Google is rate-limited (429s on burst loads);
  // Cloudinary and Unsplash aren't, but routing them through the
  // proxy lets us append the size/quality transforms that produce
  // a sharp image when the avatar is used as a full-bleed card
  // background.
  const shouldProxy =
    url.includes("lh3.googleusercontent.com") ||
    url.includes("googleusercontent.com") ||
    url.includes("res.cloudinary.com") ||
    url.includes("images.unsplash.com");

  if (!shouldProxy) return url;

  return `/api/avatar?url=${encodeURIComponent(url)}`;
}