"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  authDownload,
  authGet,
  authUploadJson,
  clearTokens,
} from "@/lib/api";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  purchase_price: string;
  selling_price: string;
  tax_percent: string;
  aliases: string[];
};

type ProductList = {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
};

const PAGE_SIZE = 20;

export default function ProductsPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<ProductList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  // Debounce: wait 300ms after typing stops, then search
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(PAGE_SIZE),
        });
        if (query) params.set("q", query);
        const res = await authGet<ProductList>(`/api/v1/products?${params}`);
        if (cancelled) return;
        setData(res);
        setError("");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        if (err instanceof ApiError && err.status === 403) {
          router.replace("/setup");
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load products");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [query, page, reload, onAuthError, router]);

  async function download(path: string, filename: string) {
    setError("");
    try {
      await authDownload(path, filename);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onAuthError();
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setNotice("");
    setImporting(true);
    try {
      const res = await authUploadJson<{ imported: number }>(
        "/api/v1/products/import",
        file
      );
      setNotice(`${res.imported} products imported successfully.`);
      setPage(1);
      setReload((n) => n + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onAuthError();
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const secondary =
    "rounded-xl border border-emerald-700 bg-white px-3 py-2 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition";

  return (
    <main className="min-h-screen bg-emerald-50/50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-md border border-emerald-100">
        {/* Header with Title and Global Language Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <h1 className="text-2xl font-black text-emerald-950">{t("products_title")}</h1>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* 🌐 ભાષા સ્વિચર */}
            <LanguageSwitcher />

            <Link
              href="/dashboard"
              className="rounded-xl border border-emerald-700 bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition"
            >
              {t("back_to_dashboard")}
            </Link>

            <button
              onClick={() =>
                download("/api/v1/products/import/template", "products_template.csv")
              }
              className={secondary}
            >
              Template
            </button>

            <label className={`${secondary} cursor-pointer`}>
              {importing ? t("saving") : "Import CSV"}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                disabled={importing}
                onChange={handleImport}
              />
            </label>

            <button
              onClick={() => download("/api/v1/products/export", "products.csv")}
              className={secondary}
            >
              Export
            </button>

            <Link
              href="/products/new"
              className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-800 transition"
            >
              {t("add_product_btn")}
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search_product_list")}
          className="mt-4 w-full rounded-xl border border-gray-300 px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />

        {notice && (
          <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800 border border-emerald-200">
            {notice}
          </p>
        )}
        {error && (
          <p className="mt-4 whitespace-pre-line rounded-xl bg-red-50 p-3.5 text-xs font-bold text-red-700 border border-red-200">
            {error}
          </p>
        )}

        {/* Products Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-emerald-800 text-white font-extrabold uppercase tracking-wider">
                <th className="p-3 rounded-l-lg">{t("item_col")}</th>
                <th className="p-3">{t("sku_col")}</th>
                <th className="p-3">{t("unit_col")}</th>
                <th className="p-3 text-right">{t("purchase_price_col")}</th>
                <th className="p-3 text-right">{t("selling_price_col")}</th>
                <th className="p-3 text-right rounded-r-lg">{t("tax_col")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-100 font-medium">
              {loading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 font-semibold">
                    {t("loading")}
                  </td>
                </tr>
              )}
              {!loading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-400 font-semibold">
                    {t("no_products")}
                  </td>
                </tr>
              )}
              {data?.items.map((p) => (
                <tr key={p.id} className="hover:bg-emerald-50/40 transition">
                  <td className="p-3 font-bold text-emerald-950">
                    <Link
                      href={`/products/${p.id}`}
                      className="text-emerald-800 hover:underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="p-3 text-gray-600 font-mono">{p.sku ?? "-"}</td>
                  <td className="p-3 text-gray-600">{p.unit}</td>
                  <td className="p-3 text-right font-mono text-gray-700">₹{p.purchase_price}</td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-700">₹{p.selling_price}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-800">{p.tax_percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="mt-4 flex items-center justify-between text-xs font-semibold text-gray-600 border-t border-gray-100 pt-3">
          <span>{t("total")}: {data?.total ?? 0}</span>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setPage((pg) => Math.max(1, pg - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40 hover:bg-gray-50 transition"
            >
              Previous
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((pg) => Math.min(totalPages, pg + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40 hover:bg-gray-50 transition"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}