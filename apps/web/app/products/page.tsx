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
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
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
      setNotice(`${res.imported} products import thaya.`);
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
    "rounded-lg border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50";

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-emerald-800">Products</h1>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
              ← Dashboard
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
              {importing ? "Importing..." : "Import CSV"}
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
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              + Add Product
            </Link>
          </div>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Naam, SKU, barcode ke brand thi shodho..."
          className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />

        {notice && (
          <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            {notice}
          </p>
        )}
        {error && (
          <p className="mt-4 whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-emerald-700 text-left text-white">
                <th className="p-2">Name</th>
                <th className="p-2">SKU</th>
                <th className="p-2">Unit</th>
                <th className="p-2 text-right">Purchase</th>
                <th className="p-2 text-right">Selling</th>
                <th className="p-2 text-right">Tax %</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-gray-500">
                    {query ? "Koi product nathi malyo." : "Haju koi product nathi."}
                  </td>
                </tr>
              )}
              {data?.items.map((p) => (
                <tr key={p.id} className="border-b border-gray-200 text-gray-800">
                  <td className="p-2 font-medium">
                    <Link
                      href={`/products/${p.id}`}
                      className="text-emerald-700 hover:underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="p-2">{p.sku ?? "-"}</td>
                  <td className="p-2">{p.unit}</td>
                  <td className="p-2 text-right">₹{p.purchase_price}</td>
                  <td className="p-2 text-right">₹{p.selling_price}</td>
                  <td className="p-2 text-right">{p.tax_percent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>Total: {data?.total ?? 0}</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}