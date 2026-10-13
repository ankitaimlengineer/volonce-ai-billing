"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ApiError, authBlobUrl, authGet, clearTokens } from "@/lib/api";

type Item = {
  product_name: string;
  quantity: string;
  rate: string;
  discount_amount: string;
  tax_percent: string;
  tax_amount: string;
  line_total: string;
};
type Invoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_id: string | null;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  grand_total: string;
  paid_amount: string;
  items: Item[];
  payments: { method: string; amount: string }[];
};
type Business = {
  profile: Record<string, string | boolean | null>;
  settings: Record<string, string | number | null>;
};
type Customer = { name: string; mobile: string | null; address: string | null };

const s = (v: unknown) => (typeof v === "string" ? v : "");

function InvoiceView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [biz, setBiz] = useState<Business | null>(null);
  const [cust, setCust] = useState<Customer | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [error, setError] = useState("");

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    let logoUrl: string | null = null;
    let sigUrl: string | null = null;
    async function load() {
      try {
        const i = await authGet<Invoice>(`/api/v1/invoices/${id}`);
        const [b, branding] = await Promise.all([
          authGet<Business>("/api/v1/business/profile"),
          authGet<{ has_logo: boolean; has_signature: boolean }>("/api/v1/business/branding"),
        ]);
        const c = i.customer_id
          ? await authGet<Customer>(`/api/v1/customers/${i.customer_id}`)
          : null;
        logoUrl = branding.has_logo ? await authBlobUrl("/api/v1/business/logo") : null;
        sigUrl = branding.has_signature ? await authBlobUrl("/api/v1/business/signature") : null;
        if (cancelled) return;
        setInv(i);
        setBiz(b);
        setCust(c);
        setLogo(logoUrl);
        setSig(sigUrl);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        setError(err instanceof Error ? err.message : "Could not load invoice");
      }
    }
    load();
    return () => {
      cancelled = true;
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      if (sigUrl) URL.revokeObjectURL(sigUrl);
    };
  }, [id, onAuthError]);

  if (error) {
    return (
      <main className="p-6">
        <p className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>
      </main>
    );
  }
  if (!inv || !biz) return <p className="p-6 text-gray-600">Loading...</p>;

  const p = biz.profile;
  const st = biz.settings;
  const address = [s(p.address), s(p.city), s(p.state), s(p.pincode)].filter(Boolean).join(", ");
  const due = Number(inv.grand_total) - Number(inv.paid_amount);
  const hasBank = s(st.bank_name) || s(st.bank_account_number) || s(st.bank_ifsc);

  return (
    <main className="min-h-screen bg-emerald-50 p-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between print:hidden">
        <Link href="/invoices" className="text-sm text-gray-600 hover:underline">
          ← Invoices
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Print / PDF
        </button>
      </div>

      <div className="mx-auto max-w-3xl rounded-xl bg-white p-8 text-sm text-gray-800 shadow print:rounded-none print:shadow-none">
        <div className="flex items-start justify-between gap-4 border-b-2 border-emerald-800 pb-4">
          <div className="flex items-center gap-3">
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Logo" className="h-16 w-16 object-contain" />
            )}
            <div>
              <p className="text-xl font-bold text-emerald-800">{s(p.name)}</p>
              {address && <p>{address}</p>}
              {s(p.mobile) && <p>Mobile: {s(p.mobile)}</p>}
              {s(p.gst_number) && <p>GST: {s(p.gst_number)}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-emerald-800">INVOICE</p>
            <p className="font-medium">{inv.invoice_number}</p>
            <p>Date: {inv.invoice_date}</p>
          </div>
        </div>

        <div className="mt-4">
          <p className="font-semibold">Bill To:</p>
          <p>{cust ? cust.name : "Walk-in Customer"}</p>
          {cust?.mobile && <p>Mobile: {cust.mobile}</p>}
          {cust?.address && <p>{cust.address}</p>}
        </div>

        <table className="mt-4 w-full">
          <thead>
            <tr className="bg-emerald-800 text-left text-white">
              <th className="p-2">Item</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Rate</th>
              <th className="p-2 text-right">Disc</th>
              <th className="p-2 text-right">Tax %</th>
              <th className="p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={i} className="border-b border-gray-200">
                <td className="p-2">{it.product_name}</td>
                <td className="p-2 text-right">{it.quantity}</td>
                <td className="p-2 text-right">₹{it.rate}</td>
                <td className="p-2 text-right">₹{it.discount_amount}</td>
                <td className="p-2 text-right">{it.tax_percent}</td>
                <td className="p-2 text-right">₹{it.line_total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-64 space-y-1 text-right">
          <p>Subtotal: ₹{inv.subtotal}</p>
          <p>Discount: -₹{inv.discount_total}</p>
          <p>Tax: ₹{inv.tax_total}</p>
          <p className="text-lg font-bold text-emerald-800">Total: ₹{inv.grand_total}</p>
          <p>Paid: ₹{inv.paid_amount}</p>
          {due > 0 && <p className="font-semibold text-amber-700">Baaki: ₹{due.toFixed(2)}</p>}
        </div>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div className="space-y-1">
            {hasBank && (
              <div>
                <p className="font-semibold">Bank Details</p>
                {s(st.bank_name) && <p>{s(st.bank_name)}</p>}
                {s(st.bank_account_holder) && <p>A/C Name: {s(st.bank_account_holder)}</p>}
                {s(st.bank_account_number) && <p>A/C No: {s(st.bank_account_number)}</p>}
                {s(st.bank_ifsc) && <p>IFSC: {s(st.bank_ifsc)}</p>}
              </div>
            )}
            {s(st.upi_id) && <p>UPI: {s(st.upi_id)}</p>}
          </div>
          <div className="text-center">
            {sig && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sig} alt="Signature" className="mx-auto h-12 object-contain" />
            )}
            <p className="border-t border-gray-400 pt-1">Authorized Signature</p>
          </div>
        </div>

        {s(st.terms_and_conditions) && (
          <div className="mt-4">
            <p className="font-semibold">Terms &amp; Conditions</p>
            <p className="whitespace-pre-line">{s(st.terms_and_conditions)}</p>
          </div>
        )}
        {s(st.invoice_footer) && (
          <p className="mt-4 text-center text-gray-500">{s(st.invoice_footer)}</p>
        )}
      </div>
    </main>
  );
}

export default function InvoicePage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-600">Loading...</p>}>
      <InvoiceView />
    </Suspense>
  );
}