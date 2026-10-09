import Link from "next/link";

export default function DashboardPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-emerald-50 p-6">
      <div className="rounded-2xl bg-white p-8 shadow text-center">
        <h1 className="text-2xl font-bold text-emerald-800">Dashboard</h1>
        <p className="mt-2 text-gray-600">Setup pooru thayu che.</p>
        <Link
          href="/products"
          className="mt-6 inline-block rounded-lg bg-emerald-700 px-6 py-2.5 font-medium text-white hover:bg-emerald-800"
        >
          Products
        </Link>
      </div>
    </main>
  );
}