"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#090a0c] px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-red-500/10 text-red-400">
          <Icon name="shieldAlert" size={28} />
        </div>
        <h2 className="mb-2 text-xl font-bold text-white">Đã xảy ra lỗi</h2>
        <p className="mb-6 text-sm text-[#626775]">
          {error.message || "Có gì đó không ổn. Vui lòng thử lại."}
        </p>
        <button
          onClick={reset}
          className="rounded-xl bg-[#ff2e93] px-6 py-3 text-sm font-bold text-white hover:bg-[#ff2e93]/80"
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}
