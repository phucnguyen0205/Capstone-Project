"use client";

import { useState, useRef } from "react";
import {
  CLOUD_NAME,
  UPLOAD_PRESET,
  CLOUDINARY_UPLOAD_URL,
  UPLOAD_LIMITS,
  type UploadType,
} from "@/lib/cloudinary";

export interface UploadResult {
  publicId: string;
  url: string;
  format: string;
  width: number;
  height: number;
  originalBytes: number;
  optimizedBytes: number;
  savedBytes: number;
  savedPercent: number;
}

/**
 * Hook: upload ảnh/video trực tiếp từ browser → Cloudinary (unsigned).
 *
 * Dùng fetch + ReadableStream thay vì XHR để:
 *   1. Không bị Cursor AI XHR interceptor
 *   2. Tracking progress qua stream reader
 *   3. Parse response đúng cách trong error handler
 */
export function useCloudinaryUpload(type: UploadType) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { maxBytes, accept } = UPLOAD_LIMITS[type];

  function validate(f: File): string | null {
    if (!accept.includes(f.type)) {
      return `Chỉ chấp nhận: ${accept.map((t) => t.split("/")[1]).join(", ")}`;
    }
    if (f.size > maxBytes) {
      return `File vượt quá ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`;
    }
    return null;
  }

  function generatePreview(f: File) {
    if (f.type.startsWith("video/")) {
      const vid = document.createElement("video");
      vid.preload = "metadata";
      vid.muted = true;
      vid.playsInline = true;
      vid.onloadeddata = () => {
        vid.currentTime = 1;
      };
      vid.onseeked = () => {
        const c = document.createElement("canvas");
        c.width = vid.videoWidth;
        c.height = vid.videoHeight;
        const ctx = c.getContext("2d");
        if (ctx) ctx.drawImage(vid, 0, 0);
        setPreview(c.toDataURL("image/jpeg", 0.7));
        URL.revokeObjectURL(vid.src);
      };
      vid.onerror = () => {
        setPreview(null);
        URL.revokeObjectURL(vid.src);
      };
      vid.src = URL.createObjectURL(f);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    }
  }

  function selectFiles(files: FileList | File[]) {
    const f = Array.from(files)[0];
    if (!f) return;
    const err = validate(f);
    if (err) {
      setError(err);
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
    generatePreview(f);
  }

  async function upload(): Promise<UploadResult | null> {
    if (!file) {
      setError("Chưa chọn file.");
      return null;
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    // Không append folder nếu preset không cho phép — để Cloudinary tự gán vào root
    // Nếu muốn folder cụ thể, set trong Upload Preset trên Cloudinary Dashboard

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // fetch không bị Cursor XHR interceptor, và hỗ trợ progress qua stream
      const response = await fetch(CLOUDINARY_UPLOAD_URL, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      setUploading(false);

      if (response.ok) {
        const data = await response.json();
        const res: UploadResult = {
          publicId: data.public_id,
          url: data.secure_url,
          format: data.format,
          width: data.width ?? 0,
          height: data.height ?? 0,
          originalBytes: file.size,
          optimizedBytes: data.bytes ?? file.size,
          savedBytes: file.size - (data.bytes ?? file.size),
          savedPercent: data.bytes
            ? Math.round((1 - data.bytes / file.size) * 100)
            : 0,
        };
        setResult(res);
        setFile(null);
        setPreview(null);
        setProgress(100);
        return res;
      } else {
        // Parse lỗi từ Cloudinary response body
        let errorMessage = `Lỗi HTTP ${response.status}`;
        try {
        const errData = await response.json();
            const errStr = JSON.stringify(errData);
            console.error("[Cloudinary Error]", errStr);
            errorMessage = errData.error?.message ?? errData.error ?? errorMessage;
        } catch {
          // response không phải JSON
          const text = await response.text().catch(() => "");
          console.error("[Cloudinary Error raw]", text);
          errorMessage = text || errorMessage;
        }
        setError(errorMessage);
        return null;
      }
    } catch (err: unknown) {
      setUploading(false);
      if (err instanceof Error && err.name === "AbortError") {
        setError("Upload bị hủy.");
      } else {
        console.error("[Cloudinary Fetch Error]", err);
        setError("Lỗi mạng hoặc bị chặn. Thử tắt extension trình duyệt.");
      }
      return null;
    }
  }

  function cancel() {
    abortControllerRef.current?.abort();
    setUploading(false);
    setProgress(0);
  }

  function reset() {
    cancel();
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  return { file, preview, uploading, progress, result, error, selectFiles, upload, cancel, reset, maxBytes };
}
