"use client";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090a0c]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-12">
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-[#232338]" />
          <div
            className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#ff2e93]"
            style={{ animationDelay: "-0.5s" }}
          />
        </div>
        <p className="text-sm text-[#626775]">Đang tải...</p>
      </div>
    </div>
  );
}
