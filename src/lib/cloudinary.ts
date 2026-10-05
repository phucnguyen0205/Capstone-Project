/**
 * Cloudinary client utilities.
 *
 * Strategy:
 *  • Browser → Cloudinary (unsigned, preset)  → public_id + secure_url
 *  • Server-side Cloudinary SDK (for delete / admin)  → kept for future use
 */

export const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "sei3lgiv";
export const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "diary_upload";

export const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;

// ── CDN helpers ──────────────────────────────────────────────────────────────

/**
 * Some early seed scripts (e.g. scripts/seed-reels.js) wrote
 * `https://res.cloudinary.com/demo/video/upload/...` URLs to the
 * database. The Cloudinary `demo` cloud only hosts a handful of
 * stock assets — most of those links 404 today. We use this helper
 * to filter them out at the API boundary so the client never sees
 * a broken video.
 *
 * Real user uploads go to the project's own cloud (CLOUD_NAME),
 * which always serves the file. Unknown clouds are kept (defensive:
 * a dev might point a different cloud at the env vars).
 */
export function isPlayableVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (!/^https?:\/\/res\.cloudinary\.com\//i.test(url)) return true;
  // Cloudinary asset. Only keep URLs from the project's own cloud
  // OR from clouds whose name we don't recognise (treated as user-
  // uploaded). The Cloudinary `demo` cloud is the only one we know
  // is unreliable and should be filtered out.
  const m = url.match(/^https?:\/\/res\.cloudinary\.com\/([^/]+)\//i);
  if (!m) return true;
  const cloud = m[1].toLowerCase();
  if (cloud === "demo") return false;
  return true;
}

function cdnUrl(
  resourceType: "image" | "video",
  transforms: string,
  publicId: string
): string {
  return `https://res.cloudinary.com/${CLOUD_NAME}/${resourceType}/upload/${transforms}/${publicId}`;
}

/** Tạo URL tối ưu cho ảnh. Dùng trong <img src={...}>. */
export function optimizedImageUrl(
  publicId: string,
  opts: {
    width?: number;
    height?: number;
    crop?: "fill" | "fit" | "scale" | "thumb" | "pad" | "crop";
    quality?: number | "auto";
    format?: "auto" | "webp" | "avif" | "jpg" | "png";
  } = {}
): string {
  const { width, height, crop = "fill", quality = "auto", format = "auto" } = opts;
  const parts: string[] = [];
  if (width) parts.push(`w_${width}`);
  if (height) parts.push(`h_${height}`);
  if (crop) parts.push(`c_${crop}`);
  parts.push(`q_${quality}`);
  parts.push(`f_${format}`);
  return cdnUrl("image", parts.join(","), publicId);
}

/** Tạo URL tối ưu cho video. */
export function optimizedVideoUrl(
  publicId: string,
  opts: {
    width?: number;
    height?: number;
    quality?: number | "auto";
    format?: "auto" | "mp4" | "webm";
  } = {}
): string {
  const { width, height, quality = "auto", format = "auto" } = opts;
  const parts: string[] = [];
  if (width) parts.push(`w_${width}`);
  if (height) parts.push(`h_${height}`);
  parts.push(`q_${quality}`);
  parts.push(`f_${format}`);
  return cdnUrl("video", parts.join(","), publicId);
}

/** Lấy thumbnail 200px cho video. */
export function videoThumbnailUrl(publicId: string): string {
  return cdnUrl("video", "w_400,h_300,c_fill,f_jpg,q_auto,so_1", publicId);
}

// ── Upload config helpers ────────────────────────────────────────────────────

export type UploadType = "avatar" | "image" | "video" | "cover";

export const UPLOAD_LIMITS: Record<UploadType, { maxBytes: number; accept: string[] }> = {
  avatar: {
    maxBytes: 5 * 1024 * 1024,
    accept: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  },
  image: {
    maxBytes: 20 * 1024 * 1024,
    accept: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/avif"],
  },
  video: {
    maxBytes: 200 * 1024 * 1024,
    accept: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"],
  },
  cover: {
    maxBytes: 10 * 1024 * 1024,
    accept: ["image/jpeg", "image/png", "image/webp"],
  },
};
