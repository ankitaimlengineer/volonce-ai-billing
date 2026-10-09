"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, authGet, clearTokens } from "@/lib/api";
import ProductForm, { EMPTY_PRODUCT, ProductData } from "../ProductForm";

type ApiProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  category_id: string | null;
  unit: string;
  pack_size: string | null;
  purchase_price: string;
  selling_price: string;
  mrp: string | null;
  tax_percent: string;
  min_stock: string;
  search_keywords: string | null;
  aliases: string[];
  attributes: Record<string, unknown>;
};

function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-emerald-50">
      <p className="text-gray-600">Loading...</p>
    </main>
  );
}

function EditProduct() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [initial, setInitial] = useState<ProductData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const p = await authGet<ApiProduct>(`/api/v1/products/${params.id}`);
        if (cancelled) return;
        setInitial({
          ...EMPTY_PRODUCT,
          id: p.id,
          name: p.name,
          sku: p.sku ?? "",
          barcode: p.barcode ?? "",
          brand: p.brand ?? "",
          category_id: p.category_id ?? "",
          unit: p.unit,
          pack_size: p.pack_size ?? "",
          purchase_price: p.purchase_price,
          selling_price: p.selling_price,
          mrp: p.mrp ?? "",
          tax_percent: p.tax_percent,
          min_stock: p.min_stock,
          search_keywords: p.search_keywords ?? "",
          aliases: p.aliases.join(", "),
          attributes: Object.fromEntries(
            Object.entries(p.attributes).map(([k, v]) => [k, String(v)])
          ),
        });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load product");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-emerald-50">
        <p className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>
      </main>
    );
  }
  if (!initial) return <Loading />;
  return <ProductForm initial={initial} />;
}

export default function EditProductPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EditProduct />
    </Suspense>
  );
}