"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { AssetKey } from "@/lib/assets";
import { useCloudinaryUpload } from "@/hooks/useCloudinaryUpload";

type UploadType = "avatar" | "image" | "video" | "cover";

const TYPES: { key: UploadType; label: string; icon: AssetKey; desc: string }[] = [
  { key: "avatar", label: "Avatar", icon: "userPlus", desc: "400×400 WebP, face detection" },
  { key: "image",  label: "Ảnh bài viết", icon: "gallery2", desc: "max 1600px, WebP/AVIF" },
  { key: "video",  label: "Video", icon: "video", desc: "720p, H.264, adaptive" },
  { key: "cover",  label: "Ảnh bìa", icon: "gallery1", desc: "1920×600 WebP" },
];

export default function UploadDemoPage() {
  const [activeType, setActiveType] = useState<UploadType>("image");

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#09090f] px-4 py-12">
      <div className="flex w-full max-w-lg flex-col gap-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Upload Server — Cloudinary</h1>
          <p className="mt-2 text-sm text-[#94a3b8]">
            Direct unsigned upload từ browser · Tự động tối ưu · Preset: <code className="rounded bg-[#1a192a] px-1.5 py-0.5 text-cyan-400">uploadPuLo</code>
          </p>
        </div>

        {/* Type selector */}
        <div className="grid grid-cols-4 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveType(t.key)}
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center text-xs transition-colors ${
                activeType === t.key
                  ? "border-teal-500 bg-teal-500/10 text-teal-400"
                  : "border-[#2c264c] bg-white/5 text-[#94a3b8] hover:border-[#3a3366]"
              }`}
            >
              <Icon name={t.icon} size={20} />
              <span className="font-semibold">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Uploader */}
        <DemoUploader type={activeType} key={activeType} />
      </div>
    </div>
  );
}

function DemoUploader({ type }: { type: UploadType }) {
  const { file, preview, uploading, progress, result, error, selectFiles, upload, reset, maxBytes } =
    useCloudinaryUpload(type);

  function formatBytes(b: number) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && document.getElementById(`demo-input-${type}`)?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter") document.getElementById(`demo-input-${type}`)?.click();
        }}
        className={`
          flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 min-h-[160px]
          transition-all cursor-pointer select-none
          ${uploading ? "opacity-50 pointer-events-none" : "hover:border-teal-500/50 hover:bg-teal-500/5"}
          ${error ? "border-red-500/50 bg-red-500/5" : "border-[#3a3366] bg-[#131326]/50"}
        `}
      >
        <input
          id={`demo-input-${type}`}
          type="file"
          accept={type === "video" ? "video/*" : "image/*"}
          className="hidden"
          onChange={(e) => { if (e.target.files) selectFiles(e.target.files); e.target.value = ""; }}
        />

        {uploading ? (
          <>
            <div className="flex items-center gap-3">
              <div className="size-7 animate-spin rounded-full border-2 border-[#9b51e0] border-t-transparent" />
              <div>
                <p className="text-sm font-semibold text-white">Đang tải lên Cloudinary...</p>
                <p className="text-xs text-[#94a3b8]">{progress}%</p>
              </div>
            </div>
            <div className="h-1.5 w-full max-w-[280px] overflow-hidden rounded-full bg-[#2c264c]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#9b51e0] to-cyan-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </>
        ) : preview ? (
          <div className="flex w-full flex-col items-center gap-2">
            {type === "video" ? (
              <video src={preview} muted playsInline className="max-h-[120px] rounded-xl object-contain" />
            ) : (
              <img src={preview} alt="Preview" className="max-h-[120px] rounded-xl object-contain" />
            )}
            <p className="text-xs text-[#94a3b8]">{file?.name} — {file && formatBytes(file.size)}</p>
            <div className="flex gap-2">
              <button type="button" onClick={(e) => { e.stopPropagation(); reset(); }}
                className="rounded-lg border border-[#3a3366] px-3 py-1.5 text-xs text-[#94a3b8] hover:border-red-500 hover:text-red-400 transition-colors">
                Hủy
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); upload(); }}
                className="rounded-lg bg-[#9b51e0] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#8b44d0] transition-colors">
                Tải lên
              </button>
            </div>
          </div>
        ) : (
          <>
            <Icon name="paperclip" size={28} className="text-[#94a3b8]" />
            <div className="text-center">
              <p className="text-sm font-semibold text-white">Kéo thả hoặc nhấn để chọn</p>
              <p className="mt-1 text-xs text-[#94a3b8]">Tối đa {formatBytes(maxBytes)} · tự động nén</p>
            </div>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <Icon name="shieldAlert" size={14} />
          {error}
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-center gap-2">
            <Icon name="check" size={14} className="text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-400">Upload thành công</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[#94a3b8]">
            <span>Gốc:</span><span className="text-white">{formatBytes(result.originalBytes)}</span>
            <span>Tối ưu:</span><span className="text-white">{formatBytes(result.optimizedBytes)}</span>
            <span>Tiết kiệm:</span>
            <span className="font-semibold text-emerald-400">
              {result.savedPercent > 0 ? `${formatBytes(result.savedBytes)} (${result.savedPercent}%)` : "—"}
            </span>
            <span>Format:</span><span className="text-white uppercase">{result.format}</span>
            {result.width > 0 && <><span>Kích thước:</span><span className="text-white">{result.width}×{result.height}px</span></>}
          </div>
          <div className="mt-1 flex flex-col gap-1">
            <span className="text-[11px] text-[#94a3b8]">URL:</span>
            <a href={result.url} target="_blank" rel="noopener noreferrer"
              className="break-all text-[10px] text-cyan-400 underline hover:text-cyan-300">
              {result.url}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
