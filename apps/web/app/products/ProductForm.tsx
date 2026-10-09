"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, authDelete, authGet, authPost, authPut, clearTokens } from "@/lib/api";

type Category = { id: string; name: string };

export type ProductData = {
  id?: string;
  name: string;
  sku: string;
  barcode: string;
  brand: string;
  category_id: string;
  unit: string;
  pack_size: string;
  purchase_price: string;
  selling_price: string;
  mrp: string;
  tax_percent: string;
  min_stock: string;
  search_keywords: string;
  aliases: string; // comma separated while typing
  attributes: Record<string, string>;
};

export const EMPTY_PRODUCT: ProductData = {
  name: "",
  sku: "",
  barcode: "",
  brand: "",
  category_id: "",
  unit: "pcs",
  pack_size: "",
  purchase_price: "0",
  selling_price: "0",
  mrp: "",
  tax_percent: "0",
  min_stock: "0",
  search_keywords: "",
  aliases: "",
  attributes: {},
};

// Extra fields per business category (saved inside "attributes")
const ATTRIBUTE_FIELDS: Record<string, { key: string; label: string; type?: string }[]> = {
  agro_shop: [
    { key: "batch", label: "Batch No" },
    { key: "expiry", label: "Expiry Date", type: "date" },
    { key: "composition", label: "Composition" },
  ],
  pharmacy: [
    { key: "batch", label: "Batch No" },
    { key: "expiry", label: "Expiry Date", type: "date" },
  ],
  clothing: [
    { key: "size", label: "Size" },
    { key: "color", label: "Color" },
    { key: "fabric", label: "Fabric" },
  ],
  electronics: [
    { key: "model", label: "Model" },
    { key: "warranty", label: "Warranty" },
  ],
  mobile: [
    { key: "model", label: "Model" },
    { key: "warranty", label: "Warranty" },
  ],
};

const input =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const label = "mt-4 block text-sm font-medium text-gray-700";

export default function ProductForm({ initial }: { initial: ProductData }) {
  const router = useRouter();
  const [form, setForm] = useState<ProductData>(initial);
  const [categories, setCategories] = useState<Category[]>([]);
  const [businessCategory, setBusinessCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = Boolean(initial.id);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [cats, biz] = await Promise.all([
          authGet<Category[]>("/api/v1/categories"),
          authGet<{ profile: { business_category: string | null } }>("/api/v1/business/profile"),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setBusinessCategory(biz.profile.business_category ?? "");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace("/login");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function update<K extends keyof ProductData>(field: K, value: ProductData[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function updateAttr(key: string, value: string) {
    setForm((f) => ({ ...f, attributes: { ...f.attributes, [key]: value } }));
  }

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    try {
      const cat = await authPost<Category>("/api/v1/categories", { name });
      setCategories((c) => [...c, cat].sort((a, b) => a.name.localeCompare(b.name)));
      update("category_id", cat.id);
      setNewCategory("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add category");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    // keep only non-empty attribute values
    const attributes = Object.fromEntries(
      Object.entries(form.attributes).filter(([, v]) => v.trim() !== "")
    );
    const payload = {
      name: form.name,
      sku: form.sku || null,
      barcode: form.barcode || null,
      brand: form.brand || null,
      category_id: form.category_id || null,
      unit: form.unit || "pcs",
      pack_size: form.pack_size || null,
      purchase_price: form.purchase_price || "0",
      selling_price: form.selling_price || "0",
      mrp: form.mrp || null,
      tax_percent: form.tax_percent || "0",
      min_stock: form.min_stock || "0",
      search_keywords: form.search_keywords || null,
      aliases: form.aliases.split(",").map((a) => a.trim()).filter(Boolean),
      attributes,
    };

    try {
      if (isEdit) {
        await authPut(`/api/v1/products/${initial.id}`, { ...payload, is_active: true });
      } else {
        await authPost("/api/v1/products", payload);
      }
      router.push("/products");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Aa product delete karvo che?")) return;
    try {
      await authDelete(`/api/v1/products/${initial.id}`);
      router.push("/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const extra = ATTRIBUTE_FIELDS[businessCategory] ?? [];

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-2xl rounded-2xl bg-white p-8 shadow"
      >
        <h1 className="text-2xl font-bold text-emerald-800">
          {isEdit ? "Edit Product" : "Add Product"}
        </h1>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <label className={label}>Product Name *</label>
        <input required className={input} value={form.name}
          onChange={(e) => update("name", e.target.value)} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>SKU</label>
            <input className={input} value={form.sku}
              onChange={(e) => update("sku", e.target.value)} />
          </div>
          <div>
            <label className={label}>Barcode</label>
            <input className={input} value={form.barcode}
              onChange={(e) => update("barcode", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Brand</label>
            <input className={input} value={form.brand}
              onChange={(e) => update("brand", e.target.value)} />
          </div>
          <div>
            <label className={label}>Category</label>
            <select className={input} value={form.category_id}
              onChange={(e) => update("category_id", e.target.value)}>
              <option value="">Select</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-2 flex gap-2">
          <input
            className={input}
            placeholder="Navi category (jem ke Grocery)"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <button type="button" onClick={addCategory}
            className="mt-1 rounded-lg border border-emerald-700 px-4 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
            Add
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Unit</label>
            <input className={input} value={form.unit}
              onChange={(e) => update("unit", e.target.value)} />
          </div>
          <div>
            <label className={label}>Pack Size</label>
            <input className={input} placeholder="100g, 1L..." value={form.pack_size}
              onChange={(e) => update("pack_size", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className={label}>Purchase ₹</label>
            <input type="number" step="0.01" min="0" className={input} value={form.purchase_price}
              onChange={(e) => update("purchase_price", e.target.value)} />
          </div>
          <div>
            <label className={label}>Selling ₹</label>
            <input type="number" step="0.01" min="0" className={input} value={form.selling_price}
              onChange={(e) => update("selling_price", e.target.value)} />
          </div>
          <div>
            <label className={label}>MRP ₹</label>
            <input type="number" step="0.01" min="0" className={input} value={form.mrp}
              onChange={(e) => update("mrp", e.target.value)} />
          </div>
          <div>
            <label className={label}>Tax %</label>
            <input type="number" step="0.01" min="0" max="100" className={input}
              value={form.tax_percent}
              onChange={(e) => update("tax_percent", e.target.value)} />
          </div>
        </div>

        <label className={label}>Minimum Stock (low stock alert mate)</label>
        <input type="number" step="0.001" min="0" className={input} value={form.min_stock}
          onChange={(e) => update("min_stock", e.target.value)} />

        {extra.length > 0 && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">Extra details</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {extra.map((f) => (
                <div key={f.key}>
                  <label className={label}>{f.label}</label>
                  <input type={f.type ?? "text"} className={input}
                    value={form.attributes[f.key] ?? ""}
                    onChange={(e) => updateAttr(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        )}

        <label className={label}>Aliases (comma thi alag karo)</label>
        <input className={input} placeholder="parle, biscuit" value={form.aliases}
          onChange={(e) => update("aliases", e.target.value)} />

        <label className={label}>Search Keywords</label>
        <input className={input} value={form.search_keywords}
          onChange={(e) => update("search_keywords", e.target.value)} />

        <div className="mt-8 flex items-center justify-between">
          <Link href="/products" className="text-sm text-gray-600 hover:underline">
            ← Back
          </Link>
          <div className="flex gap-3">
            {isEdit && (
              <button type="button" onClick={handleDelete}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50">
                Delete
              </button>
            )}
            <button type="submit" disabled={saving}
              className="rounded-lg bg-emerald-700 px-6 py-2.5 font-medium text-white hover:bg-emerald-800 disabled:opacity-60">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}