"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, authGet, authPost, authPut, clearTokens } from "@/lib/api";

type Profile = {
  name: string;
  owner_name: string;
  business_type: string;
  business_category: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gst_number: string;
};

type BusinessResponse = {
  profile: Partial<Record<keyof Profile, string | null>> & { setup_completed: boolean };
};

const BUSINESS_TYPES = [
  ["retail", "Retail"],
  ["wholesale", "Wholesale"],
  ["distributor", "Distributor"],
  ["manufacturer", "Manufacturer"],
  ["service", "Service"],
  ["other", "Other"],
];

const BUSINESS_CATEGORIES = [
  ["general_store", "General Store"],
  ["clothing", "Clothing"],
  ["electronics", "Electronics"],
  ["mobile", "Mobile"],
  ["hardware", "Hardware"],
  ["bakery", "Bakery"],
  ["furniture", "Furniture"],
  ["spare_parts", "Spare Parts"],
  ["agro_shop", "Agro Shop"],
  ["pharmacy", "Pharmacy"],
  ["other", "Other"],
];

const EMPTY: Profile = {
  name: "",
  owner_name: "",
  business_type: "",
  business_category: "",
  mobile: "",
  email: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  gst_number: "",
};

const input =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const label = "mt-4 block text-sm font-medium text-gray-700";

export default function SetupPage() {
  const router = useRouter();
  const [form, setForm] = useState<Profile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await authGet<BusinessResponse>("/api/v1/business/profile");
        if (data.profile.setup_completed) {
          router.replace("/dashboard");
          return;
        }
        const next = { ...EMPTY };
        for (const key of Object.keys(EMPTY) as (keyof Profile)[]) {
          next[key] = data.profile[key] ?? "";
        }
        setForm(next);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          clearTokens();
          router.replace("/login");
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  function update(field: keyof Profile, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await authPut("/api/v1/business/profile", {
        ...form,
        owner_name: form.owner_name || null,
        business_type: form.business_type || null,
        business_category: form.business_category || null,
        mobile: form.mobile || null,
        email: form.email || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        gst_number: form.gst_number || null,
      });
      // Branding and invoice template steps are added in 2.4 / 2.5.
      // For now, finish setup right after the business info.
      await authPost("/api/v1/business/complete-setup");
      router.push("/dashboard");
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

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-emerald-50">
        <p className="text-gray-600">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-xl rounded-2xl bg-white p-8 shadow"
      >
        <p className="text-sm font-medium text-emerald-700">Step 1 of 1 (haal)</p>
        <h1 className="text-2xl font-bold text-emerald-800">Business Setup</h1>
        <p className="mt-1 text-sm text-gray-600">
          Aa information invoice ma automatic aavshe.
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <label className={label}>Business Name *</label>
        <input required minLength={2} className={input} value={form.name}
          onChange={(e) => update("name", e.target.value)} />

        <label className={label}>Owner Name</label>
        <input className={input} value={form.owner_name}
          onChange={(e) => update("owner_name", e.target.value)} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Business Type *</label>
            <select required className={input} value={form.business_type}
              onChange={(e) => update("business_type", e.target.value)}>
              <option value="">Select</option>
              {BUSINESS_TYPES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Business Category *</label>
            <select required className={input} value={form.business_category}
              onChange={(e) => update("business_category", e.target.value)}>
              <option value="">Select</option>
              {BUSINESS_CATEGORIES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Mobile *</label>
            <input required className={input} value={form.mobile}
              onChange={(e) => update("mobile", e.target.value)} />
          </div>
          <div>
            <label className={label}>Email</label>
            <input type="email" className={input} value={form.email}
              onChange={(e) => update("email", e.target.value)} />
          </div>
        </div>

        <label className={label}>Address *</label>
        <textarea required rows={2} className={input} value={form.address}
          onChange={(e) => update("address", e.target.value)} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={label}>City *</label>
            <input required className={input} value={form.city}
              onChange={(e) => update("city", e.target.value)} />
          </div>
          <div>
            <label className={label}>State *</label>
            <input required className={input} value={form.state}
              onChange={(e) => update("state", e.target.value)} />
          </div>
          <div>
            <label className={label}>Pincode *</label>
            <input required className={input} value={form.pincode}
              onChange={(e) => update("pincode", e.target.value)} />
          </div>
        </div>

        <label className={label}>GST Number (optional)</label>
        <input className={input} value={form.gst_number}
          onChange={(e) => update("gst_number", e.target.value)} />

        <button
          type="submit"
          disabled={saving}
          className="mt-8 w-full rounded-lg bg-emerald-700 py-2.5 font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save & Continue"}
        </button>
      </form>
    </main>
  );
}