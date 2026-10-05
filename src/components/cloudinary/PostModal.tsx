"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@/components/ui/Icon";

export type LensLevel = "public" | "friends" | "close";

interface PostModalProps {
  onClose: () => void;
  onPost: (post: {
    mediaUrl: string;
    mediaType: "image" | "video";
    caption: string;
    lens: LensLevel;
    publicId: string;
    mediaWidth?: number;
    mediaHeight?: number;
  }) => void;
}

const LENS_OPTIONS: { key: LensLevel; label: string; icon: string; color: string; desc: string }[] = [
  {
    key: "public",
    label: "Công khai",
    icon: "globe",
    color: "border-blue-500/40 bg-blue-500/10 text-blue-400",
    desc: "Mọi người đều thấy",
  },
  {
    key: "friends",
    label: "Bè bạn",
    icon: "users2",
    color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    desc: "Chỉ bè bạn trong nhóm",
  },
  {
    key: "close",
    label: "Bạn thân",
    icon: "lockSmall",
    color: "border-violet-500/40 bg-violet-500/10 text-violet-400",
    desc: "Cấp 3 — Thân thiết",
  },
];

const ACCEPT_IMAGE = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/avif";
const ACCEPT_VIDEO = "video/mp4,video/webm,video/quicktime";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function PostModal({ onClose, onPost }: PostModalProps) {
  const [mode, setMode] = useState<"image" | "video">("image");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [lens, setLens] = useState<LensLevel>("friends");
  const [mediaWidth, setMediaWidth] = useState<number | undefined>();
  const [mediaHeight, setMediaHeight] = useState<number | undefined>();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const UPLOAD_PRESET = "diary_upload";
  const CLOUD_NAME = "sei3lgiv";
  const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;

  function handleFileChange(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    const accept = mode === "video" ? ACCEPT_VIDEO : ACCEPT_IMAGE;
    if (!accept.split(",").includes(f.type)) {
      setError(`Chỉ chấp nhận: ${mode === "video" ? "video" : "ảnh"}`);
      return;
    }
    if (f.size > (mode === "video" ? 200 : 20) * 1024 * 1024) {
      setError(`File vượt quá ${mode === "video" ? 200 : 20} MB.`);
      return;
    }

    // Revoke the previous preview URL to free memory — otherwise
    // every file the user picks leaks a blob URL until the modal
    // unmounts.
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFile(f);
    setError(null);
    setMediaWidth(undefined);
    setMediaHeight(undefined);

    const url = URL.createObjectURL(f);
    setPreview(url);

    // Detect dimensions. We use a throwaway Image/Video element (not
    // appended to the DOM) so we can grab native dimensions without
    // paying for layout. On error we leave dimensions undefined and
    // the server will fall back to defaults.
    if (!f.type.startsWith("video")) {
      const img = new window.Image();
      img.onload = () => {
        setMediaWidth(img.naturalWidth);
        setMediaHeight(img.naturalHeight);
      };
      img.onerror = () => {
        setMediaWidth(undefined);
        setMediaHeight(undefined);
      };
      img.src = url;
    } else {
      const vid = document.createElement("video");
      vid.preload = "metadata";
      vid.onloadedmetadata = () => {
        setMediaWidth(vid.videoWidth);
        setMediaHeight(vid.videoHeight);
        // Drop the src so the element can be GC'd.
        vid.src = "";
      };
      vid.onerror = () => {
        setMediaWidth(undefined);
        setMediaHeight(undefined);
      };
      vid.src = url;
    }
  }

  async function handlePost() {
    if (!file) {
      setError("Chưa chọn ảnh/video.");
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    // Không append folder — set trong preset trên Cloudinary Dashboard

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(UPLOAD_URL, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      setUploading(false);

      if (response.ok) {
        const data = await response.json();
        onPost({
          mediaUrl: data.secure_url,
          mediaType: mode,
          caption,
          lens,
          publicId: data.public_id,
          mediaWidth,
          mediaHeight,
        });
      } else {
        let msg = `Lỗi HTTP ${response.status}`;
        try {
          const errData = await response.json();
          const errStr = JSON.stringify(errData);
          console.error("[Cloudinary Error]", errStr);
          msg = errData.error?.message ?? errData.error ?? msg;
        } catch {
          const text = await response.text().catch(() => "");
          console.error("[Cloudinary Error raw]", text);
          msg = text || msg;
        }
        setError(msg);
      }
    } catch (err: unknown) {
      setUploading(false);
      if (err instanceof Error && err.name === "AbortError") {
        setError("Upload bị hủy.");
      } else {
        console.error("[PostModal Upload Error]", err);
        setError("Lỗi mạng. Thử tắt extension trình duyệt.");
      }
    }
  }

  // Free the blob URL when the modal closes (or unmounts) so we
  // don't leak one URL per "create post" session. We mirror `preview`
  // into a ref so the unmount closure sees the latest value (the
  // state value would be stale inside the cleanup).
  const previewRef = useRef<string | null>(null);
  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (previewRef.current) URL.revokeObjectURL(previewRef.current);
          previewRef.current = null;
          onClose();
        }
      }}
    >
      <div className="flex w-full max-w-[560px] flex-col rounded-2xl border border-[#3a3366] bg-[#131326] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2c264c] px-5 py-4">
          <h2 className="text-[16px] font-bold text-white">Tạo bài viết</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            aria-label="Đóng"
          >
            <Icon name="circleX" size={16} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 border-b border-[#2c264c] px-5 py-3">
          {(["image", "video"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setFile(null); setPreview(null); setError(null); }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === m
                  ? "border-teal-500 bg-teal-500/15 text-teal-400"
                  : "border-[#2c264c] bg-white/5 text-[#94a3b8]"
              }`}
            >
              <Icon name={m === "video" ? "video" : "layoutGrid"} size={12} />
              {m === "video" ? "Video" : "Ảnh"}
            </button>
          ))}
        </div>

        {/* Upload area */}
        <div className="flex flex-col gap-3 px-5 py-4">
          <input
            ref={inputRef}
            type="file"
            accept={mode === "video" ? ACCEPT_VIDEO : ACCEPT_IMAGE}
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files)}
          />

          {preview ? (
            <div className="relative flex flex-col gap-2">
              {mode === "video" ? (
                <video
                  src={preview}
                  controls
                  preload="metadata"
                  playsInline
                  className="max-h-[280px] w-full rounded-xl object-contain bg-black"
                  onError={(e) => {
                    console.error("[PostModal] Video preview failed to load", preview);
                    setError("Không xem trước được video. Vui lòng thử định dạng MP4/H.264.");
                  }}
                >
                </video>
              ) : (
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-[280px] w-full rounded-xl object-contain"
                />
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#94a3b8]">
                  {file?.name} — {file && formatBytes(file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => { setFile(null); setPreview(null); }}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Gỡ
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex h-[160px] w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#3a3366] hover:border-teal-500/50 hover:bg-teal-500/5 transition-colors cursor-pointer"
            >
              {mode === "video" ? (
                <Icon name="video" size={28} className="text-[#94a3b8]" />
              ) : (
                <Icon name="gallery2" size={28} className="text-[#94a3b8]" />
              )}
              <div className="text-center">
                <p className="text-sm font-semibold text-[#f1f1f7]">
                  Kéo thả hoặc nhấn để chọn {mode === "video" ? "video" : "ảnh"}
                </p>
                <p className="mt-1 text-xs text-[#94a3b8]">
                  Tối đa {mode === "video" ? "200 MB" : "20 MB"} · tự động nén WebP/AVIF
                </p>
              </div>
            </button>
          )}

          {error && (
            <p className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <Icon name="shieldAlert" size={14} className="shrink-0" />
              <span>{error}</span>
            </p>
          )}

          {/* Caption */}
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Viết chú thích..."
            rows={3}
            maxLength={1000}
            className="w-full resize-none rounded-xl border border-[#2c264c] bg-[#0d0d1a] px-3 py-2.5 text-sm text-[#f1f1f7] placeholder-[#67678d] outline-none focus:border-[#9b51e0] transition-colors"
          />

          {/* Lens selector */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[#94a3b8]">Hiển thị với</span>
            <div className="flex gap-2">
              {LENS_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setLens(opt.key)}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center text-xs transition-colors ${
                    lens === opt.key
                      ? opt.color
                      : "border-[#2c264c] bg-white/5 text-[#94a3b8] hover:border-[#3a3366]"
                  }`}
                >
                  <Icon name={opt.icon as any} size={16} />
                  <span className="font-semibold leading-tight">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#2c264c] px-5 py-4">
          {uploading && (
            <div className="flex items-center gap-2 flex-1">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#2c264c]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#9b51e0] to-cyan-400 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-[#94a3b8]">{progress}%</span>
            </div>
          )}

          {!uploading && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[#2c264c] bg-white/5 px-4 py-2 text-sm font-semibold text-[#94a3b8] hover:bg-white/10 transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handlePost}
                disabled={!file || uploading}
                className={`flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-teal-500 px-5 py-2 text-sm font-bold text-white shadow-[0_4px_12px_rgba(139,92,246,0.3)] transition-all ${
                  !file || uploading
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:shadow-[0_4px_20px_rgba(139,92,246,0.5)] hover:scale-[1.02]"
                }`}
              >
                <Icon name="camera" size={14} />
                Đăng bài
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
