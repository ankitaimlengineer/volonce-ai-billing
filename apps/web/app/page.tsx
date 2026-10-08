import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-emerald-50 p-6">
      <h1 className="text-4xl font-bold text-emerald-800">VOLONCE AI BILLING</h1>
      <p className="mt-3 text-gray-600 text-center max-w-md">
        Bill banao, confirm karo, baaki software pote manage kare.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/login"
          className="rounded-lg bg-emerald-700 px-6 py-3 text-white font-medium hover:bg-emerald-800"
        >
          Login
        </Link>
        <Link
          href="/register"
          className="rounded-lg border border-emerald-700 px-6 py-3 text-emerald-700 font-medium hover:bg-emerald-100"
        >
          Register
        </Link>
      </div>
    </main>
  );
}