import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
      <div className="text-center space-y-4 p-8">
        <div className="text-6xl font-bold text-[var(--muted)]">404</div>
        <h1 className="text-xl font-semibold">页面不存在</h1>
        <p className="text-sm text-[var(--muted)]">你访问的页面可能已被移除或地址有误</p>
        <Link
          href="/"
          className="inline-block mt-4 px-6 py-2.5 rounded-xl bg-blue-500 text-white text-sm hover:bg-blue-600 transition-colors"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
