"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ApiError, authBlobUrl, authDownload, authGet, clearTokens } from "@/lib/api";

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

type InvoiceTemplate = "professional" | "minimal" | "modern" | "retail" | "wholesale";

const s = (v: unknown) => (typeof v === "string" ? v : "");

// રકમને શબ્દોમાં (INR Words) ફેરવે છે
function numberToWordsINR(num: number): string {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function inWords(n: number): string {
    if (n === 0) return "";
    if (n < 20) return a[n] + " ";
    if (n < 100) return b[Math.floor(n / 10)] + " " + a[n % 10] + " ";
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred " + inWords(n % 100);
    if (n < 100000) return inWords(Math.floor(n / 1000)) + "Thousand " + inWords(n % 1000);
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + "Lakh " + inWords(n % 100000);
    return inWords(Math.floor(n / 10000000)) + "Crore " + inWords(n % 10000000);
  }

  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);

  let result = "Rupees " + (integerPart === 0 ? "Zero" : inWords(integerPart)).trim();
  if (decimalPart > 0) {
    result += " and " + inWords(decimalPart).trim() + " Paise";
  }
  return result + " Only";
}

// 🎨 ૫ ટેમ્પલેટ્સનું ડાયનેમિક સ્ટાઇલ મેપિંગ (Section 8 અનુસાર)
const TEMPLATE_STYLES: Record<
  InvoiceTemplate,
  {
    container: string;
    headerBg: string;
    headerText: string;
    tableHead: string;
    totalBar: string;
    borderAccent: string;
    fontFamily: string;
    badgeStyle: string;
  }
> = {
  professional: {
    container: "border-2 border-emerald-800 shadow-xl",
    headerBg: "bg-emerald-800 text-white",
    headerText: "text-emerald-100",
    tableHead: "bg-emerald-800 text-white",
    totalBar: "bg-emerald-800 text-white border-emerald-900",
    borderAccent: "border-emerald-200",
    fontFamily: "font-sans",
    badgeStyle: "bg-emerald-700 text-white",
  },
  minimal: {
    container: "border border-slate-300 shadow-sm",
    headerBg: "bg-white text-slate-900 border-b-2 border-slate-900",
    headerText: "text-slate-600",
    tableHead: "bg-slate-100 text-slate-800 border-y border-slate-300",
    totalBar: "bg-slate-900 text-white border-slate-950",
    borderAccent: "border-slate-200",
    fontFamily: "font-sans",
    badgeStyle: "bg-slate-800 text-white",
  },
  modern: {
    container: "border-2 border-teal-500 rounded-3xl shadow-2xl",
    headerBg: "bg-gradient-to-r from-teal-700 via-emerald-700 to-cyan-800 text-white",
    headerText: "text-cyan-100",
    tableHead: "bg-teal-700 text-white",
    totalBar: "bg-gradient-to-r from-teal-800 to-emerald-900 text-white border-teal-900",
    borderAccent: "border-teal-100",
    fontFamily: "font-sans",
    badgeStyle: "bg-teal-600 text-white",
  },
  retail: {
    container: "border-2 border-dashed border-slate-700 shadow-none",
    headerBg: "bg-slate-900 text-white",
    headerText: "text-slate-300",
    tableHead: "bg-slate-800 text-white border-b-2 border-dashed border-slate-600",
    totalBar: "bg-slate-900 text-white border-slate-900",
    borderAccent: "border-slate-300",
    fontFamily: "font-mono",
    badgeStyle: "bg-black text-white",
  },
  wholesale: {
    container: "border-4 border-slate-800 shadow-md",
    headerBg: "bg-slate-800 text-white border-b-4 border-slate-950",
    headerText: "text-slate-200",
    tableHead: "bg-slate-700 text-white",
    totalBar: "bg-slate-800 text-white border-slate-950",
    borderAccent: "border-slate-300",
    fontFamily: "font-serif",
    badgeStyle: "bg-slate-800 text-white",
  },
};

function InvoiceView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [inv, setInv] = useState<Invoice | null>(null);
  const [biz, setBiz] = useState<Business | null>(null);
  const [cust, setCust] = useState<Customer | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [error, setError] = useState("");

  // ડાયનેમિક ટેમ્પલેટ પસંદગી
  const [currentTemplate, setCurrentTemplate] = useState<InvoiceTemplate>("professional");
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    // સેફ્ટી ગાર્ડ: જો URL માં સાચો ID ન હોય તો રીડાયરેક્ટ કરો
    if (!id || id === "[id]" || id.includes("[") || id.length < 30) {
      router.replace("/invoices");
      return;
    }

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

        // સેટિંગ્સમાંથી ડિફોલ્ટ પસંદ કરેલું ટેમ્પલેટ લોડ કરો
        const tName = s(b.settings?.invoice_template).toLowerCase() as InvoiceTemplate;
        if (tName && TEMPLATE_STYLES[tName]) {
          setCurrentTemplate(tName);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        setError(err instanceof Error ? err.message : "બિલ લોડ થઈ શક્યું નથી.");
      }
    }

    load();

    return () => {
      cancelled = true;
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      if (sigUrl) URL.revokeObjectURL(sigUrl);
    };
  }, [id, onAuthError, router]);

  // 🚀 ૧-ક્લિક સંપૂર્ણ ટેક્સ ઇન્વોઇસ WhatsApp સેન્ડર
  const sendWhatsApp = () => {
    if (!inv || !biz) return;

    // ગ્રાહકનો ફોન નંબર સાફ કરો (જો ૧૦ અંકનો હોય તો આગળ 91 લગાવો)
    const rawPhone = cust?.mobile ? cust.mobile.replace(/[^0-9]/g, "") : "";
    const formattedPhone = rawPhone.length === 10 ? "91" + rawPhone : rawPhone;

    // વસ્તુઓની યાદી બનાવો
    const itemsList = (inv.items || [])
      .map(
        (it) =>
          `• *${it.product_name}* (જથ્થો: ${Number(it.quantity)}) = ₹${Number(it.line_total).toFixed(2)}`
      )
      .join("\n");

    const grandTotalVal = Number(inv.grand_total) || 0;
    const paidVal = Number(inv.paid_amount) || 0;
    const dueVal = Math.max(0, grandTotalVal - paidVal);

    // તમે માંગેલું ૧૦૦% અસલ ફોર્મેટ
    const msg = 
`🧾 *ટેક્સ ઇન્વોઇસ - ${s(biz.profile.name).toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━
👤 *ગ્રાહક:* ${cust ? cust.name : "Walk-in Customer"}
📄 *બિલ નં:* ${inv.invoice_number}
📅 *તારીખ:* ${inv.invoice_date}

🛍️ *ખરીદેલી વસ્તુઓની વિગત:*
${itemsList}
━━━━━━━━━━━━━━━━━━━━
💵 *સબટોટલ:* ₹${Number(inv.subtotal).toFixed(2)}
📊 *GST ટેક્સ:* ₹${Number(inv.tax_total).toFixed(2)}
💰 *કુલ રકમ:* *₹${grandTotalVal.toFixed(2)}*
✅ *પેમેન્ટ સ્થિતિ:* ${dueVal <= 0 ? "ચૂકતે (PAID)" : `બાકી: ₹${dueVal.toFixed(2)}`}

🙏 *મુલાકાત બદલ ખૂબ ખૂબ આભાર! ફરી પધારશો.*`;

    // સીધું જ WhatsApp Web / App ખોલો (કોઈ ચોકઠા  કે ભાંગેલા અક્ષરો નહીં આવે)
    const whatsappUrl = formattedPhone
      ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;

    window.open(whatsappUrl, "_blank");
  };

  // હાઈ-ડેફિનેશન વેક્ટર PDF ડાઉનલોડર
  const downloadDirectPDF = async () => {
    if (!inv) return;
    setIsDownloadingPdf(true);
    try {
      await authDownload(
        `/api/v1/whatsapp/invoices/${inv.id}/download-pdf`,
        `Invoice-${inv.invoice_number}.pdf`
      );
    } catch {
      window.print();
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-md border border-red-200 text-center">
          <p className="text-red-700 font-bold mb-4">⚠️ {error}</p>
          <Link
            href="/invoices"
            className="inline-block rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-800 transition"
          >
            ← બધા બિલોની યાદી પર જાઓ
          </Link>
        </div>
      </main>
    );
  }

  if (!inv || !biz) {
    return <p className="p-8 text-emerald-800 font-bold text-center animate-pulse">બિલ લોડ થઈ રહ્યું છે...</p>;
  }

  const p = biz.profile;
  const st = biz.settings;
  const address = [s(p.address), s(p.city), s(p.state), s(p.pincode)].filter(Boolean).join(", ");
  const grandTotalNum = Number(inv.grand_total) || 0;
  const paidAmountNum = Number(inv.paid_amount) || 0;
  const due = Math.max(0, grandTotalNum - paidAmountNum);
  const isFullyPaid = due <= 0;
  const hasBank = s(st.bank_name) || s(st.bank_account_number) || s(st.bank_ifsc);

  // Dynamic UPI QR Code
  const upiId = s(st.upi_id) || "store@upi";
  const upiString = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(s(p.name) || "Store")}&am=${grandTotalNum.toFixed(2)}&cu=INR`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=4&data=${encodeURIComponent(upiString)}`;

  const activeTheme = TEMPLATE_STYLES[currentTemplate] || TEMPLATE_STYLES.professional;

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background: #ffffff !important;
          }
          .no-print {
            display: none !important;
          }
          .print-full {
            box-shadow: none !important;
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* Top Floating Buttons (Screen only) */}
      <div className="mx-auto mb-6 flex max-w-4xl flex-wrap items-center justify-between gap-3 no-print">
        <Link
          href="/invoices"
          className="rounded-xl border border-emerald-700 bg-white px-4 py-2 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition"
        >
          ← બધા બિલો (Invoices)
        </Link>

        {/* 🎨 ૧-ક્લિક લાઈવ ટેમ્પલેટ સ્વિચર */}
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-500">ટેમ્પલેટ થીમ:</span>
          <select
            value={currentTemplate}
            onChange={(e) => setCurrentTemplate(e.target.value as InvoiceTemplate)}
            className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
          >
            <option value="professional">🟢 Professional</option>
            <option value="minimal">⚪ Minimal</option>
            <option value="modern">🔵 Modern Teal</option>
            <option value="retail">🟡 Retail Thermal</option>
            <option value="wholesale">🟤 Wholesale Bold</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* WhatsApp બટન */}
          <button
            type="button"
            onClick={sendWhatsApp}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-700 transition"
          >
            💬 WhatsApp પર મોકલો
          </button>

          {/* PDF ડાઉનલોડ બટન */}
          <button
            type="button"
            onClick={downloadDirectPDF}
            disabled={isDownloadingPdf}
            className="flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-teal-800 disabled:opacity-50 transition"
          >
            {isDownloadingPdf ? "⏳ ડાઉનલોડ..." : "📥 PDF ડાઉનલોડ"}
          </button>

          {/* પ્રિન્ટ બટન */}
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-black transition"
          >
            🖨️ પ્રિન્ટ (Print)
          </button>
        </div>
      </div>

      {/* DYNAMIC INVOICE CARD TARGET FOR PDF & PRINT */}
      <div
        id="invoice-bill-card"
        className={`print-full mx-auto w-full max-w-4xl overflow-hidden rounded-2xl bg-white ${activeTheme.container} ${activeTheme.fontFamily}`}
      >
        {/* Dynamic Header */}
        <div className={`${activeTheme.headerBg} p-7 flex flex-wrap justify-between items-center gap-4`}>
          <div className="flex items-center gap-4">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt="Logo"
                className="h-20 w-20 rounded-xl bg-white p-1 object-contain shadow-md"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white text-3xl font-black text-slate-800 shadow">
                {s(p.name).charAt(0) || "V"}
              </div>
            )}
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
                Official Business Invoice • {currentTemplate.toUpperCase()}
              </span>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">{s(p.name) || "Store"}</h1>
              {address && <p className={`text-xs ${activeTheme.headerText} max-w-md mt-0.5`}>{address}</p>}
              <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium">
                {s(p.mobile) && <span>📞 +91 {s(p.mobile)}</span>}
                {s(p.email) && <span>✉️ {s(p.email)}</span>}
                {s(p.gst_number) && (
                  <span className="rounded bg-black/10 px-2 py-0.5 font-bold border border-current">
                    GSTIN: {s(p.gst_number)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block rounded-md bg-black/10 px-3 py-1 text-xs font-black tracking-wider uppercase border border-current">
              TAX INVOICE
            </span>
            <p className="mt-2 text-xl font-mono font-black tracking-tight">{inv.invoice_number}</p>
            <p className="text-xs opacity-90 font-medium mt-1">
              બિલ તારીખ: <span className="font-bold">{inv.invoice_date}</span>
            </p>
          </div>
        </div>

        {/* Customer & Payment Meta Details */}
        <div className={`grid grid-cols-1 md:grid-cols-12 gap-0 border-b ${activeTheme.borderAccent} bg-slate-50/60 text-xs`}>
          <div className={`md:col-span-7 p-6 border-b md:border-b-0 md:border-r ${activeTheme.borderAccent}`}>
            <span className="font-extrabold text-slate-500 uppercase tracking-wider block text-[10px] mb-1">
              બિલ મેળવનાર (BILL TO / CUSTOMER)
            </span>
            <p className="text-lg font-black text-gray-900">{cust ? cust.name : "Walk-in Customer"}</p>
            {cust?.mobile && <p className="text-gray-700 mt-1 font-semibold">📞 ફોન: +91 {cust.mobile}</p>}
            {cust?.address && <p className="text-gray-600 mt-0.5">{cust.address}</p>}
          </div>

          <div className="md:col-span-5 p-6 flex flex-col justify-between space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-gray-600">પેમેન્ટ સ્થિતિ:</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-black tracking-wide ${
                  isFullyPaid
                    ? activeTheme.badgeStyle
                    : "bg-red-100 text-red-900 border border-red-300"
                }`}
              >
                {isFullyPaid ? "✓ PAID (સત્તાવાર ચૂકતે)" : `બાકી: ₹${due.toFixed(2)}`}
              </span>
            </div>
            <div className={`flex justify-between items-center pt-2 border-t ${activeTheme.borderAccent}`}>
              <span className="font-bold text-gray-600">પેમેન્ટ પદ્ધતિ:</span>
              <span className="font-mono font-bold uppercase text-sm">
                {inv.payments[0]?.method || "CASH"}
              </span>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="p-6">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className={`${activeTheme.tableHead} text-xs font-extrabold uppercase tracking-wider`}>
                <th className="py-3 px-3 text-center w-12 rounded-l-lg">#</th>
                <th className="py-3 px-3">વસ્તુ / વિગત (ITEM DESCRIPTION)</th>
                <th className="py-3 px-3 text-center w-24">જથ્થો (QTY)</th>
                <th className="py-3 px-3 text-right w-28">દર (RATE)</th>
                <th className="py-3 px-3 text-right w-24">ડિસ્કાઉન્ટ</th>
                <th className="py-3 px-3 text-right w-20">GST</th>
                <th className="py-3 px-4 text-right w-32 rounded-r-lg">કુલ રકમ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {inv.items.map((it, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <td className="py-3.5 px-3 text-center font-bold text-xs">{idx + 1}</td>
                  <td className="py-3.5 px-3 font-bold text-gray-900 text-sm">
                    {it.product_name}
                  </td>
                  <td className="py-3.5 px-3 text-center font-bold text-gray-800 font-mono">
                    {Number(it.quantity)}
                  </td>
                  <td className="py-3.5 px-3 text-right text-gray-700 font-mono">
                    ₹{Number(it.rate).toFixed(2)}
                  </td>
                  <td className="py-3.5 px-3 text-right text-gray-500 font-mono">
                    ₹{Number(it.discount_amount).toFixed(2)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-bold font-mono">
                    {it.tax_percent}%
                  </td>
                  <td className="py-3.5 px-4 text-right font-black font-mono text-base">
                    ₹{Number(it.line_total).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Amount In Words Container */}
          <div className="mt-4 rounded-xl bg-slate-50 p-3.5 border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 uppercase">શબ્દોમાં રકમ:</span>
            <span className="text-xs font-bold text-slate-900 italic">
              {numberToWordsINR(grandTotalNum)}
            </span>
          </div>

          {/* Bottom Grid: QR Code + Bank Details + Grand Total */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-6 border-t-2 border-slate-100 pt-6">
            {/* Left: Dynamic Scan & Pay UPI QR Code + Bank Info */}
            <div className="md:col-span-7 flex flex-wrap gap-4 items-center rounded-xl bg-slate-50 p-4 border border-slate-200">
              {/* Dynamic Scannable UPI QR */}
              <div className="flex flex-col items-center bg-white p-2 rounded-xl shadow-sm border border-slate-300">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCodeUrl} alt="UPI QR" className="h-28 w-28 object-contain" />
                <span className="text-[9px] font-black tracking-wider uppercase mt-1">
                  Scan to Pay (UPI)
                </span>
              </div>

              {/* Bank Details */}
              <div className="flex-1 text-xs text-gray-700 min-w-[180px]">
                {hasBank ? (
                  <>
                    <p className="font-extrabold mb-1">🏦 બેંક ખાતાની વિગત:</p>
                    {s(st.bank_name) && <p><span className="text-gray-500">બેંક:</span> {s(st.bank_name)}</p>}
                    {s(st.bank_account_holder) && <p><span className="text-gray-500">નામ:</span> {s(st.bank_account_holder)}</p>}
                    {s(st.bank_account_number) && <p><span className="text-gray-500">A/C:</span> <span className="font-mono font-bold">{s(st.bank_account_number)}</span></p>}
                    {s(st.bank_ifsc) && <p><span className="text-gray-500">IFSC:</span> <span className="font-mono font-bold">{s(st.bank_ifsc)}</span></p>}
                  </>
                ) : (
                  <p className="text-gray-400 italic">UPI ID: {upiId}</p>
                )}
                {s(st.upi_id) && (
                  <p className="mt-2 font-bold">
                    UPI: <span className="font-mono text-gray-900">{s(st.upi_id)}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Right: Calculations & Grand Total Bar */}
            <div className="md:col-span-5 space-y-2 text-right text-xs">
              <div className="flex justify-between text-gray-600 font-medium">
                <span>સબટોટલ (Subtotal):</span>
                <span className="font-mono font-bold text-gray-800">₹{Number(inv.subtotal).toFixed(2)}</span>
              </div>
              {Number(inv.discount_total) > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>ડિસ્કાઉન્ટ (Discount):</span>
                  <span className="font-mono font-bold">-₹{Number(inv.discount_total).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600 font-medium">
                <span>કુલ ટેક્સ (GST Total):</span>
                <span className="font-mono font-bold text-gray-800">₹{Number(inv.tax_total).toFixed(2)}</span>
              </div>

              {/* Dynamic Grand Total Bar */}
              <div className={`mt-3 rounded-xl p-4 flex justify-between items-center shadow-md border ${activeTheme.totalBar}`}>
                <span className="text-xs font-black tracking-wider uppercase">કુલ રકમ (Total):</span>
                <span className="text-2xl font-mono font-black">₹{grandTotalNum.toFixed(2)}</span>
              </div>

              <div className="flex justify-between pt-2 text-xs font-medium text-gray-600">
                <span>ચૂકવેલ રકમ (Paid):</span>
                <span className="font-mono font-bold">₹{paidAmountNum.toFixed(2)}</span>
              </div>
              {due > 0 && (
                <div className="flex justify-between text-xs font-bold text-red-600">
                  <span>બાકી રકમ (Due):</span>
                  <span className="font-mono">₹{due.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Terms and Digital Signature */}
          <div className="mt-8 flex flex-wrap justify-between items-end gap-6 pt-6 border-t border-slate-100 text-xs">
            <div className="max-w-md">
              {s(st.terms_and_conditions) ? (
                <>
                  <p className="font-bold mb-1">શરતો અને નિયમો:</p>
                  <p className="text-gray-500 whitespace-pre-line leading-relaxed text-[11px]">
                    {s(st.terms_and_conditions)}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-gray-400">
                  ૧. માલ વેચાયા પછી પરત લેવામાં આવશે નહીં. ૨. કોઈપણ વિવાદ માટે સ્થાનિક ન્યાયક્ષેત્ર માન્ય રહેશે.
                </p>
              )}
            </div>

            <div className="text-center min-w-[200px]">
              {sig ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sig} alt="Signature" className="mx-auto h-12 object-contain mb-1" />
              ) : (
                <div className="h-12 flex items-center justify-center">
                  <span className="font-serif italic text-slate-400 font-bold">Digitally Signed</span>
                </div>
              )}
              <div className="border-t-2 border-slate-800 pt-1 font-bold">
                {s(p.name)} માટે
              </div>
              <p className="text-[10px] text-gray-400">ઓથોરાઇઝ્ડ સહી (Authorized Signatory)</p>
            </div>
          </div>
        </div>

        {/* Digital Verification Bottom Bar */}
        <div className={`${activeTheme.headerBg} py-2.5 px-6 text-center flex flex-wrap justify-between items-center text-[10px] font-semibold opacity-90`}>
          <span>✓ કમ્પ્યુટર દ્વારા જનરેટ થયેલ GST બિલ ({currentTemplate.toUpperCase()})</span>
          <span>{s(st.invoice_footer) || "મુલાકાત બદલ આભાર! ફરી પધારશો."}</span>
          <span className="font-bold">VOLONCE AI BILLING</span>
        </div>
      </div>
    </main>
  );
}

export default function InvoicePage() {
  return (
    <Suspense fallback={<p className="p-6 text-emerald-800 font-semibold animate-pulse">બિલ લોડ થઈ રહ્યું છે...</p>}>
      <InvoiceView />
    </Suspense>
  );
}