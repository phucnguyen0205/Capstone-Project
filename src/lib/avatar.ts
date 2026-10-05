/**
 * Resolve a user avatar URL to a same-origin proxied URL when the
 * upstream is Cloudinary or Unsplash (so we can inject
 * size/quality transforms).
 *
 * IMPORTANT: Google avatar URLs (lh3.googleusercontent.com) are
 * deliberately returned AS-IS — we do NOT route them through
 * `/api/avatar` anymore. As of 2026 Google's CDN refuses
 * server-side fetches entirely (returns 403 to any non-browser
 * request, even with `User-Agent: Mozilla/5.0` and the right
 * `Referer`), so our proxy would have failed every time and the
 * browser would have rendered a broken-image icon. Letting the
 * browser load the URL directly:
 *   - keeps Google's anti-hotlink protection happy (the browser
 *     sends the page's `Referer` automatically), and
 *   - lets the browser cache the `=s96-c` thumbnail (the default
 *     size we request on sign-in) without an extra round-trip
 *     through our server.
 *   - and it's also faster: no `/api/avatar` round-trip in the
 *     critical render path.
 *
 * Cloudinary and Unsplash are NOT rate-limited at the server
 * boundary, but we still proxy them so we can upgrade the
 * resolution to the original (Cloudinary strips the transform
 * segment, Unsplash drops its size/quality query params) — the
 * browser then downscales to fit the rendered box, which looks
 * crisp on retina and avoids a separate "load 2x" pass.
 *
 * Pure on the client too — callers can use it inside a useMemo / render
 * without needing the request URL.
 */
export function proxyAvatar(url: string | null | undefined): string | null {
  if (!url) return null;

  // Already same-origin (data URI, relative path, or our own upload
  // route) — no need to re-proxy.
  if (url.startsWith("/") || url.startsWith("data:")) return url;

  // Google avatars: pass through unchanged. See the doc-comment
  // above for the 403 / referrer reasoning.
  if (url.includes("lh3.googleusercontent.com") || url.includes("googleusercontent.com")) {
    return url;
  }

  // Detect the upstreams we proxy so we can both cache + bump their
  // resolution.
  const shouldProxy =
    url.includes("res.cloudinary.com") ||
    url.includes("images.unsplash.com");

  if (!shouldProxy) return url;

  return `/api/avatar?url=${encodeURIComponent(url)}`;
}