"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  authBlobUrl,
  authGet,
  authPost,
  authPut,
  clearTokens,
} from "@/lib/api";
import InvoicePreview, { PreviewData } from "./InvoicePreview";

type Settings = {
  bank_name: string;
  bank_account_holder: string;
  bank_account_number: string;
  bank_ifsc: string;
  upi_id: string;
  terms_and_conditions: string;
  invoice_footer: string;
  invoice_template: string;
  invoice_prefix: string;
  invoice_number_padding: string; // kept as text while typing, clamped on save
};

type BusinessResponse = {
  profile: Record<string, string | boolean | null>;
  settings: Partial<Record<string, string | number | null>>;
};

type Branding = { has_logo: boolean; has_signature: boolean };

const TEMPLATES = [
  ["professional", "Professional"],
  ["minimal", "Minimal"],
  ["modern", "Modern"],
  ["retail", "Retail"],
  ["wholesale", "Wholesale"],
];

const DEFAULTS: Settings = {
  bank_name: "",
  bank_account_holder: "",
  bank_account_number: "",
  bank_ifsc: "",
  upi_id: "",
  terms_and_conditions: "",
  invoice_footer: "",
  invoice_template: "professional",
  invoice_prefix: "INV",
  invoice_number_padding: "5",
};

const input =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const label = "mt-4 block text-sm font-medium text-gray-700";

const str = (v: unknown) => (typeof v === "string" ? v : "");

function clampPadding(v: string): number {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return 5;
  return Math.min(10, Math.max(3, n));
}

export default function InvoiceSetupPage() {
  const router = useRouter();
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [profile, setProfile] = useState<Record<string, string | boolean | null>>({});
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    let logo: string | null = null;
    let sig: string | null = null;

    async function load() {
      try {
        const data = await authGet<BusinessResponse>("/api/v1/business/profile");
        const branding = await authGet<Branding>("/api/v1/business/branding");
        logo = branding.has_logo ? await authBlobUrl("/api/v1/business/logo") : null;
        sig = branding.has_signature
          ? await authBlobUrl("/api/v1/business/signature")
          : null;
        if (cancelled) return;
        setProfile(data.profile);
        setS({
          bank_name: str(data.settings.bank_name),
          bank_account_holder: str(data.settings.bank_account_holder),
          bank_account_number: str(data.settings.bank_account_number),
          bank_ifsc: str(data.settings.bank_ifsc),
          upi_id: str(data.settings.upi_id),
          terms_and_conditions: str(data.settings.terms_and_conditions),
          invoice_footer: str(data.settings.invoice_footer),
          invoice_template: str(data.settings.invoice_template) || "professional",
          invoice_prefix: str(data.settings.invoice_prefix) || "INV",
          invoice_number_padding: String(
            Number(data.settings.invoice_number_padding) || 5
          ),
        });
        setLogoUrl(logo);
        setSignatureUrl(sig);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          onAuthError();
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    return () => {
      cancelled = true;
      // free the blob URLs created for the preview images
      if (logo) URL.revokeObjectURL(logo);
      if (sig) URL.revokeObjectURL(sig);
    };
  }, [onAuthError]);

  function update<K extends keyof Settings>(field: K, value: Settings[K]) {
    setS((prev) => ({ ...prev, [field]: value }));
  }

  async function handleFinish(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await authPut("/api/v1/business/settings", {
        bank_name: s.bank_name || null,
        bank_account_holder: s.bank_account_holder || null,
        bank_account_number: s.bank_account_number || null,
        bank_ifsc: s.bank_ifsc || null,
        upi_id: s.upi_id || null,
        terms_and_conditions: s.terms_and_conditions || null,
        invoice_footer: s.invoice_footer || null,
        invoice_template: s.invoice_template,
        invoice_prefix: s.invoice_prefix.trim() || "INV",
        invoice_number_padding: clampPadding(s.invoice_number_padding),
      });
      await authPost("/api/v1/business/complete-setup");
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onAuthError();
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

  const preview: PreviewData = {
    name: str(profile.name),
    address: str(profile.address),
    city: str(profile.city),
    state: str(profile.state),
    pincode: str(profile.pincode),
    mobile: str(profile.mobile),
    gst_number: str(profile.gst_number),
    template: s.invoice_template,
    prefix: s.invoice_prefix,
    padding: clampPadding(s.invoice_number_padding),
    bank_name: s.bank_name,
    bank_account_holder: s.bank_account_holder,
    bank_account_number: s.bank_account_number,
    bank_ifsc: s.bank_ifsc,
    upi_id: s.upi_id,
    terms: s.terms_and_conditions,
    footer: s.invoice_footer,
    logoUrl,
    signatureUrl,
  };

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
        <form onSubmit={handleFinish} className="rounded-2xl bg-white p-8 shadow">
          <p className="text-sm font-medium text-emerald-700">Step 3 of 3</p>
          <h1 className="text-2xl font-bold text-emerald-800">Invoice Settings</h1>
          <p className="mt-1 text-sm text-gray-600">
            Je bharsho te jamna side invoice preview ma turant dekhase.
          </p>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}

          <label className={label}>Invoice Template</label>
          <select
            className={input}
            value={s.invoice_template}
            onChange={(e) => update("invoice_template", e.target.value)}
          >
            {TEMPLATES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Invoice Prefix</label>
              <input
                required
                maxLength={20}
                className={input}
                value={s.invoice_prefix}
                onChange={(e) => update("invoice_prefix", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Number Digits (3-10)</label>
              <input
                type="number"
                min={3}
                max={10}
                className={input}
                value={s.invoice_number_padding}
                onChange={(e) => update("invoice_number_padding", e.target.value)}
              />
            </div>
          </div>

          <h2 className="mt-6 font-semibold text-gray-800">Bank Details</h2>
          <label className={label}>Bank Name</label>
          <input
            className={input}
            value={s.bank_name}
            onChange={(e) => update("bank_name", e.target.value)}
          />
          <label className={label}>Account Holder Name</label>
          <input
            className={input}
            value={s.bank_account_holder}
            onChange={(e) => update("bank_account_holder", e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Account Number</label>
              <input
                className={input}
                value={s.bank_account_number}
                onChange={(e) => update("bank_account_number", e.target.value)}
              />
            </div>
            <div>
              <label className={label}>IFSC</label>
              <input
                className={input}
                value={s.bank_ifsc}
                onChange={(e) => update("bank_ifsc", e.target.value)}
              />
            </div>
          </div>

          <label className={label}>UPI ID</label>
          <input
            className={input}
            placeholder="name@bank"
            value={s.upi_id}
            onChange={(e) => update("upi_id", e.target.value)}
          />

          <label className={label}>Terms &amp; Conditions</label>
          <textarea
            rows={3}
            className={input}
            value={s.terms_and_conditions}
            onChange={(e) => update("terms_and_conditions", e.target.value)}
          />

          <label className={label}>Invoice Footer</label>
          <input
            className={input}
            placeholder="Thank you for your business!"
            value={s.invoice_footer}
            onChange={(e) => update("invoice_footer", e.target.value)}
          />

          <div className="mt-8 flex items-center justify-between">
            <Link href="/setup/branding" className="text-sm text-gray-600 hover:underline">
              ← Back
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-700 px-6 py-2.5 font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Finish Setup"}
            </button>
          </div>
        </form>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-sm font-medium text-gray-700">Live Preview</p>
          <InvoicePreview d={preview} />
        </div>
      </div>
    </main>
  );
}