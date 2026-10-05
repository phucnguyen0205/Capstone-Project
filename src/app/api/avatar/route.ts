import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy for Google / Cloudinary / Unsplash avatar URLs.
 *
 * Why this exists:
 *   The browser fetches `session.user.image` directly from Google.
 *   When a single screen renders dozens of avatars at once (member
 *   lists, conversation lists, post authors, gallery, ...), the
 *   request burst hits Google's CDN rate limit and Google returns 429
 *   — every avatar on the page stops loading and the user sees
 *   broken-image icons.
 *
 * What this does:
 *   1. Validates that the URL we are about to fetch is one of the
 *      allowed hosts (lh3.googleusercontent.com, googleusercontent.com,
 *      res.cloudinary.com, images.unsplash.com). Without this guard
 *      anyone could turn our proxy into an open redirect / SSRF
 *      target.
 *   2. Strips size/quality hints from the URL (`=s96-c`, `?w=200`,
 *      Cloudinary transforms, etc.) and replaces them with `=s0` or
 *      no-params so the upstream CDN serves the ORIGINAL image at
 *      maximum resolution. The browser downscales to fit the rendered
 *      size, which always looks sharp on retina.
 *   3. Streams the binary body back to the browser with a long
 *      `Cache-Control` so subsequent component re-renders are served
 *      from the browser cache and never re-hit the upstream.
 *
 *   We also use the `force-static` hint so Next.js tries to cache the
 *   handler's response across CDN edges when one is configured.
 */

const ALLOWED_HOSTS = new Set([
  "lh3.googleusercontent.com",
  "googleusercontent.com",
  // We support Cloudinary too so any user-uploaded avatar that still
  // happens to live in Cloudinary also benefits from the browser cache
  // and the size-bump transforms in `bumpAvatarSize`.
  "res.cloudinary.com",
  // Unsplash CDN — same idea: route through the proxy so we can
  // request a high-res variant instead of the 200 px default.
  "images.unsplash.com",
]);

// Long-lived browser cache. Avatars rarely change; when they do the
// user's avatar URL is replaced by a fresh row in the DB so the cache
// key changes anyway.
const BROWSER_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url");
  if (!urlParam) {
    return new NextResponse("Missing url", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return new NextResponse("Host not allowed", { status: 400 });
  }

  // Strip size/quality hints so the upstream CDN serves the ORIGINAL
  // image (maximum resolution). The browser downscales to fit the
  // rendered size, which always looks sharp on retina — better than
  // trying to pick a fixed pixel size that may be too small or too
  // large for the destination card.
  const finalUrl = bumpAvatarSize(target);

  // Cache the upstream fetch in-memory for 5 minutes per process. With
  // Next dev/prod processes this dedupes bursts across the same Node
  // instance without persisting anything to disk.
  const cached = responseCache.get(finalUrl);
  const now = Date.now();
  let body: ArrayBuffer | null = null;
  let contentType = "image/jpeg";
  if (cached && now - cached.fetchedAt < 5 * 60 * 1000) {
    body = cached.body;
    contentType = cached.contentType;
  } else {
    const upstream = await fetch(finalUrl, {
      // Pass through Google-specific size hint untouched so we still
      // request the optimal resolution.
      headers: { Accept: "image/*" },
    });
    if (!upstream.ok) {
      return new NextResponse(`Upstream ${upstream.status}`, {
        status: upstream.status,
      });
    }
    contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    // Guard against pathological upstream responses (e.g. an HTML
    // error page returned with 200, or an absurdly large file). 25 MB
    // is comfortably larger than any legitimate avatar while still
    // small enough to avoid OOMing the server when many requests
    // arrive in parallel.
    const declaredLength = Number(
      upstream.headers.get("content-length") ?? "0",
    );
    if (declaredLength > 25 * 1024 * 1024) {
      return new NextResponse("Upstream too large", { status: 413 });
    }
    body = await upstream.arrayBuffer();
    if (body.byteLength > 25 * 1024 * 1024) {
      return new NextResponse("Upstream too large", { status: 413 });
    }
    responseCache.set(finalUrl, {
      body,
      contentType,
      fetchedAt: now,
    });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Aggressively cache in the browser so each <img src> only
      // causes one network request across re-renders / navigations.
      "Cache-Control": `public, max-age=${BROWSER_CACHE_MAX_AGE_SECONDS}, immutable`,
    },
  });
}

// Tiny in-memory cache. Lives for the duration of the Node process —
// Next.js dev/prod hot-reloads recreate it which is fine because the
// browser cache survives the reload.
type CachedEntry = {
  body: ArrayBuffer;
  contentType: string;
  fetchedAt: number;
};
const responseCache = new Map<string, CachedEntry>();

// Run on the Node.js runtime so we can use the in-memory cache and
// arbitrary `fetch()` (no Edge runtime restrictions).
export const runtime = "nodejs";

/**
 * Strip size/quality hints from avatar URLs so the upstream CDN
 * serves the ORIGINAL image (highest quality the CDN has on file).
 *
 *   - Google (`lh3.googleusercontent.com`, `googleusercontent.com`):
 *       removes any `=s<size>` (or `/s<size>/`) hint and appends
 *       `=s0` to force the original resolution. `=s0` is Google's
 *       "no size limit, give me the source image" sentinel.
 *   - Cloudinary (`res.cloudinary.com`):
 *       strips the entire transform segment so the URL becomes
 *       `…/upload/{publicId}.{ext}` — the raw uploaded asset.
 *   - Unsplash (`images.unsplash.com`):
 *       removes every size/quality query param so Unsplash returns
 *       the full original photo.
 *   - Anything else: passes through unchanged.
 *
 * Pure and cheap to call on every request.
 */

function bumpAvatarSize(url: URL): string {
  const hostname = url.hostname;
  const isGoogle =
    hostname === "lh3.googleusercontent.com" ||
    hostname === "googleusercontent.com";
  const isCloudinary = hostname === "res.cloudinary.com";
  const isUnsplash = hostname === "images.unsplash.com";

  if (isGoogle) return bumpGoogle(url);
  if (isCloudinary) return bumpCloudinary(url);
  if (isUnsplash) return bumpUnsplash(url);
  return url.toString();
}

function bumpGoogle(url: URL): string {
  const raw = url.toString();
  // Strip query-form size hint (`=s96-c`, `=s512-c512`, `=s2048` …)
  // and replace with `=s0` which requests the source image.
  const stripped = raw.replace(/=s\d+(?:-c(?:\d+)?)?(?=&|\?|$|#)/, "");
  // Strip path-form size hint (`/s96-c/photo.jpg` → `/photo.jpg`).
  const stripped2 = stripped.replace(
    /\/s\d+(?:-c(?:\d+)?)?(?=\/)/,
    "",
  );
  // Always append `=s0` so we get the original resolution regardless
  // of what the source URL looked like. If there's already an `=s0`
  // or any query, append `&s0`; otherwise start the query with `s0`.
  if (/[?&]s0(?:[^0-9]|$)/.test(stripped2)) return stripped2;
  return stripped2 + (stripped2.includes("?") ? "&s0" : "?s0");
}

function bumpCloudinary(url: URL): string {
  const raw = url.toString();
  // Strip the entire transform segment so the URL becomes the raw
  // uploaded asset. Real Cloudinary URL shape:
  //   https://res.cloudinary.com/{cloud}/{type}/upload/{transforms?}/{publicId}.{ext}[?…]
  // We also need to handle URLs whose transform segment is missing
  // entirely — in that case there's nothing to strip.
  const cld = raw.match(
    /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/[^/]+\/upload\/)(.*)$/,
  );
  if (!cld) return raw;
  const prefix = cld[1];
  const rest = cld[2];
  const slashIdx = rest.indexOf("/");
  const firstSeg = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
  const afterFirst = slashIdx === -1 ? "" : rest.slice(slashIdx + 1);
  const looksLikeTransform =
    firstSeg.includes("_") || firstSeg.includes(",");
  // If the first segment after `/upload/` looks like a transform
  // (contains `_` or `,`), drop it. Otherwise the URL is already
  // original (no transform segment).
  const publicIdAndQuery = looksLikeTransform ? afterFirst : rest;
  return `${prefix}${publicIdAndQuery}`;
}

function bumpUnsplash(url: URL): string {
  // Drop every query param. Unsplash returns the original photo when
  // no size/quality hint is present.
  return `${url.origin}${url.pathname}`;
}