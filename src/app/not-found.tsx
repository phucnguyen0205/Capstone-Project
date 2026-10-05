import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#090a0c] px-6">
      <div className="w-full max-w-md text-center">
        <div
          className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-white/5"
        >
          <span className="text-4xl">🔍</span>
        </div>
        <h1 className="mb-2 text-4xl font-extrabold text-white">404</h1>
        <h2 className="mb-4 text-xl font-bold text-white">Không tìm thấy trang</h2>
        <p className="mb-8 text-sm text-[#626775]">
          Trang bạn đang tìm kiếm không tồn tại hoặc đã bị di chuyển.
        </p>
        <Link
          href="/"
          className="inline-block rounded-xl bg-[#ff2e93] px-6 py-3 text-sm font-bold text-white hover:bg-[#ff2e93]/80"
        >
          Quay về trang chủ
        </Link>
      </div>
    </div>
  );
}
