"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ApiError,
  authBlobUrl,
  authDelete,
  authGet,
  authPost,
  authPut,
  authUpload,
  clearTokens,
} from "@/lib/api";

type Category = { id: string; name: string };

export type VariantItem = {
  id?: string;
  variant_name: string;
  sku: string;
  barcode: string;
  purchase_price: string;
  selling_price: string;
  mrp: string;
};

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
  aliases: string;
  attributes: Record<string, string>;
  variants?: VariantItem[];
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
  variants: [],
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
  "mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm";
const label = "mt-4 block text-xs font-bold text-gray-700 uppercase tracking-wider";

export default function ProductForm({ initial }: { initial: ProductData }) {
  const router = useRouter();
  const [form, setForm] = useState<ProductData>(initial);
  const [variants, setVariants] = useState<VariantItem[]>(initial.variants || []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [businessCategory, setBusinessCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
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

        // જો પ્રોડક્ટ અગાઉ બનેલી હોય તો તેના વેરિઅન્ટ્સ લાવો
        if (initial.id) {
          const varRes = await authGet<VariantItem[]>(`/api/v1/products/${initial.id}/variants`);
          if (!cancelled && varRes) {
            setVariants(varRes);
          }
        }
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
  }, [initial.id, router]);

  // Load product photo
  useEffect(() => {
    if (!initial.id) return;
    let cancelled = false;
    let created: string | null = null;
    authBlobUrl(`/api/v1/products/${initial.id}/image`).then((u) => {
      created = u;
      if (!cancelled) setImageUrl(u);
      else if (u) URL.revokeObjectURL(u);
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [initial.id]);

  function update<K extends keyof ProductData>(field: K, value: ProductData[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function updateAttr(key: string, value: string) {
    setForm((f) => ({ ...f, attributes: { ...f.attributes, [key]: value } }));
  }

  // વેરિઅન્ટ ઉમેરવા માટેનું ફંક્શન
  const addVariantRow = () => {
    setVariants((prev) => [
      ...prev,
      {
        variant_name: "",
        sku: "",
        barcode: "",
        purchase_price: form.purchase_price || "0",
        selling_price: form.selling_price || "0",
        mrp: form.mrp || "",
      },
    ]);
  };

  // વેરિઅન્ટ રો ની વિગતો અપડેટ કરવા માટે
  const updateVariantRow = (index: number, key: keyof VariantItem, val: string) => {
    setVariants((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: val } : row))
    );
  };

  // વેરિઅન્ટ રો હટાવવા માટે
  const removeVariantRow = async (index: number) => {
    const row = variants[index];
    if (row.id && initial.id) {
      if (!confirm("આ વેરિઅન્ટ કાયમ માટે ડિલીટ કરવો છે?")) return;
      try {
        await authDelete(`/api/v1/products/${initial.id}/variants/${row.id}`);
      } catch {
        alert("વેરિઅન્ટ ડિલીટ કરવામાં સમસ્યા આવી.");
        return;
      }
    }
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

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

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !initial.id) return;
    setError("");
    setImageBusy(true);
    try {
      await authUpload(`/api/v1/products/${initial.id}/image`, file);
      setImageUrl(await authBlobUrl(`/api/v1/products/${initial.id}/image`));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setImageBusy(false);
    }
  }

  async function removeImage() {
    if (!initial.id) return;
    setImageBusy(true);
    try {
      await authDelete(`/api/v1/products/${initial.id}/image`);
      setImageUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setImageBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

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
      let savedProduct: { id: string };
      if (isEdit) {
        savedProduct = await authPut(`/api/v1/products/${initial.id}`, { ...payload, is_active: true });
      } else {
        savedProduct = await authPost("/api/v1/products", payload);
      }

      // વેરિઅન્ટ્સ સેવ / અપડેટ કરો
      for (const v of variants) {
        if (!v.variant_name.trim()) continue;
        const vPayload = {
          variant_name: v.variant_name.trim(),
          sku: v.sku.trim() || null,
          barcode: v.barcode.trim() || null,
          purchase_price: v.purchase_price || "0",
          selling_price: v.selling_price || "0",
          mrp: v.mrp || null,
        };
        if (v.id) {
          await authPut(`/api/v1/products/${savedProduct.id}/variants/${v.id}`, vPayload);
        } else {
          await authPost(`/api/v1/products/${savedProduct.id}/variants`, vPayload);
        }
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
    if (!confirm("આ પ્રોડક્ટ ડિલીટ કરવી છે?")) return;
    try {
      await authDelete(`/api/v1/products/${initial.id}`);
      router.push("/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const extra = ATTRIBUTE_FIELDS[businessCategory] ?? [];

  return (
    <main className="min-h-screen bg-emerald-50/50 p-4 md:p-8">
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-6 md:p-8 shadow-md border border-emerald-100"
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div>
            <h1 className="text-2xl font-black text-emerald-950">
              {isEdit ? "પ્રોડક્ટમાં સુધારો (Edit Product)" : "નવી પ્રોડક્ટ ઉમેરો (Add Product)"}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">સામાન્ય વિગત, ભાવ અને વેરિઅન્ટ્સ મેનેજ કરો</p>
          </div>
          <Link
            href="/products"
            className="rounded-xl border border-emerald-700 bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition"
          >
            ← પ્રોડક્ટ્સ લિસ્ટ
          </Link>
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 p-3.5 text-xs font-bold text-red-700 border border-red-200">
            ⚠️ {error}
          </p>
        )}

        {isEdit ? (
          <div className="mt-5 flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-white border border-emerald-200 shadow-sm overflow-hidden">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="Product" className="max-h-20 max-w-20 object-contain" />
              ) : (
                <span className="text-[10px] text-gray-400 font-semibold">No photo</span>
              )}
            </div>
            <div className="flex gap-2.5">
              <label className="cursor-pointer rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 shadow transition">
                {imageBusy ? "Please wait..." : imageUrl ? "ફોટો બદલો" : "ફોટો અપલોડ કરો"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={imageBusy}
                  onChange={handleImage}
                />
              </label>
              {imageUrl && (
                <button
                  type="button"
                  onClick={removeImage}
                  disabled={imageBusy}
                  className="rounded-xl border border-gray-300 px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-white transition"
                >
                  હટાવો
                </button>
              )}
            </div>
          </div>
        ) : null}

        <label className={label}>પ્રોડક્ટનું નામ (Product Name) *</label>
        <input
          required
          className={input}
          placeholder="દા.ત. Cotton T-Shirt, Sunflower Oil, iPhone 15..."
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>મેઇન SKU</label>
            <input className={input} value={form.sku} onChange={(e) => update("sku", e.target.value)} />
          </div>
          <div>
            <label className={label}>મેઇન બારકોડ</label>
            <input className={input} value={form.barcode} onChange={(e) => update("barcode", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>બ્રાન્ડ (Brand)</label>
            <input className={input} value={form.brand} onChange={(e) => update("brand", e.target.value)} />
          </div>
          <div>
            <label className={label}>કેટેગરી (Category)</label>
            <select
              className={input}
              value={form.category_id}
              onChange={(e) => update("category_id", e.target.value)}
            >
              <option value="">પસંદ કરો</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-2 flex gap-2">
          <input
            className={input}
            placeholder="નવી કેટેગરી ઉમેરો (દા.ત. Grocery, Dairy)"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <button
            type="button"
            onClick={addCategory}
            className="mt-1 rounded-xl border border-emerald-700 bg-white px-4 text-xs font-bold text-emerald-800 hover:bg-emerald-50 transition"
          >
            + Add
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>યુનિટ (Unit)</label>
            <input className={input} value={form.unit} onChange={(e) => update("unit", e.target.value)} />
          </div>
          <div>
            <label className={label}>પેક સાઈઝ</label>
            <input
              className={input}
              placeholder="100g, 1L, 1Box..."
              value={form.pack_size}
              onChange={(e) => update("pack_size", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className={label}>ખરીદ ભાવ ₹</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={input}
              value={form.purchase_price}
              onChange={(e) => update("purchase_price", e.target.value)}
            />
          </div>
          <div>
            <label className={label}>વેચાણ ભાવ ₹</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={input}
              value={form.selling_price}
              onChange={(e) => update("selling_price", e.target.value)}
            />
          </div>
          <div>
            <label className={label}>MRP ₹</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className={input}
              value={form.mrp}
              onChange={(e) => update("mrp", e.target.value)}
            />
          </div>
          <div>
            <label className={label}>ટેક્સ % (GST)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              className={input}
              value={form.tax_percent}
              onChange={(e) => update("tax_percent", e.target.value)}
            />
          </div>
        </div>

        <label className={label}>મિનિમમ સ્ટોક એલર્ટ (Low Stock Alert)</label>
        <input
          type="number"
          step="0.001"
          min="0"
          className={input}
          value={form.min_stock}
          onChange={(e) => update("min_stock", e.target.value)}
        />

        {extra.length > 0 && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="text-xs font-black text-emerald-950 uppercase">વધારાની વિગતો ({businessCategory})</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mt-1">
              {extra.map((f) => (
                <div key={f.key}>
                  <label className={label}>{f.label}</label>
                  <input
                    type={f.type ?? "text"}
                    className={input}
                    value={form.attributes[f.key] ?? ""}
                    onChange={(e) => updateAttr(f.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---------------- PRODUCT VARIANTS SECTION ---------------- */}
        <div className="mt-8 rounded-2xl border-2 border-emerald-300 bg-emerald-50/30 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200/80 pb-3">
            <div>
              <h2 className="text-base font-black text-emerald-950">
                📦 પ્રોડક્ટ વેરિઅન્ટ્સ (Product Variants)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                જો આ પ્રોડક્ટ વિવિધ સાઈઝ (S, M, L), વજન (500g, 1kg) કે કલરમાં ઉપલબ્ધ હોય તો ઉમેરો
              </p>
            </div>
            <button
              type="button"
              onClick={addVariantRow}
              className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-900 transition"
            >
              + Add Variant
            </button>
          </div>

          {variants.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400 font-medium">
              કોઈ વેરિઅન્ટ ઉમેરેલ નથી. સાદી પ્રોડક્ટ તરીકે મેઇન ભાવ લાગુ થશે.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-emerald-200 text-slate-700 font-extrabold uppercase">
                    <th className="py-2.5 pr-2">વેરિઅન્ટનું નામ / સાઈઝ *</th>
                    <th className="py-2.5 pr-2">SKU</th>
                    <th className="py-2.5 pr-2">બારકોડ</th>
                    <th className="py-2.5 pr-2 w-28 text-right">ખરીદ ભાવ ₹</th>
                    <th className="py-2.5 pr-2 w-28 text-right">વેચાણ ભાવ ₹</th>
                    <th className="py-2.5 pr-2 w-24 text-right">MRP ₹</th>
                    <th className="py-2.5 text-right w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100 font-medium">
                  {variants.map((v, idx) => (
                    <tr key={idx} className="hover:bg-white/80 transition">
                      <td className="py-2.5 pr-2">
                        <input
                          required
                          placeholder="દા.ત. 1 L, 500g, XL"
                          value={v.variant_name}
                          onChange={(e) => updateVariantRow(idx, "variant_name", e.target.value)}
                          className="w-full rounded-lg border border-gray-300 p-2 text-xs text-gray-900 font-bold focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-2.5 pr-2">
                        <input
                          placeholder="SKU"
                          value={v.sku}
                          onChange={(e) => updateVariantRow(idx, "sku", e.target.value)}
                          className="w-full rounded-lg border border-gray-300 p-2 text-xs text-gray-900 font-mono focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-2.5 pr-2">
                        <input
                          placeholder="Barcode"
                          value={v.barcode}
                          onChange={(e) => updateVariantRow(idx, "barcode", e.target.value)}
                          className="w-full rounded-lg border border-gray-300 p-2 text-xs text-gray-900 font-mono focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-2.5 pr-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={v.purchase_price}
                          onChange={(e) => updateVariantRow(idx, "purchase_price", e.target.value)}
                          className="w-full rounded-lg border border-gray-300 p-2 text-xs text-gray-900 text-right font-mono"
                        />
                      </td>
                      <td className="py-2.5 pr-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={v.selling_price}
                          onChange={(e) => updateVariantRow(idx, "selling_price", e.target.value)}
                          className="w-full rounded-lg border border-emerald-400 bg-white p-2 text-xs text-emerald-800 font-black text-right font-mono focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="py-2.5 pr-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={v.mrp}
                          onChange={(e) => updateVariantRow(idx, "mrp", e.target.value)}
                          className="w-full rounded-lg border border-gray-300 p-2 text-xs text-gray-900 text-right font-mono"
                        />
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => removeVariantRow(idx)}
                          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 font-bold"
                          title="કાઢી નાખો"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <label className={label}>Aliases (અન્ય નામો - અલ્પવિરામથી અલગ કરો)</label>
        <input
          className={input}
          placeholder="parle, biscuit, glucose"
          value={form.aliases}
          onChange={(e) => update("aliases", e.target.value)}
        />

        <label className={label}>Search Keywords (શોધ માટેના કીવર્ડ્સ)</label>
        <input
          className={input}
          placeholder="biscuit, snack, food"
          value={form.search_keywords}
          onChange={(e) => update("search_keywords", e.target.value)}
        />

        <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-5">
          <Link href="/products" className="text-xs font-bold text-gray-600 hover:underline">
            ← રદ કરો (Cancel)
          </Link>
          <div className="flex gap-3">
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-xl border border-red-300 px-4 py-2.5 text-xs font-bold text-red-700 hover:bg-red-50 transition"
              >
                ડિલીટ
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-60 shadow-md transition"
            >
              {saving ? "સેવ થાય છે..." : "સેવ કરો (Save Product) ✓"}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}