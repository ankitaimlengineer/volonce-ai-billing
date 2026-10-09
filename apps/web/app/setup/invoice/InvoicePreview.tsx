export type PreviewData = {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  mobile: string;
  gst_number: string;
  template: string;
  prefix: string;
  padding: number;
  bank_name: string;
  bank_account_holder: string;
  bank_account_number: string;
  bank_ifsc: string;
  upi_id: string;
  terms: string;
  footer: string;
  logoUrl: string | null;
  signatureUrl: string | null;
};

const SAMPLE_ITEMS = [
  { name: "Sample Product A", qty: 2, rate: 100 },
  { name: "Sample Product B", qty: 1, rate: 250 },
];

const THEMES: Record<string, { head: string; accent: string; table: string; font: string }> = {
  professional: {
    head: "border-b-4 border-emerald-800",
    accent: "text-emerald-800",
    table: "bg-emerald-800 text-white",
    font: "font-sans",
  },
  minimal: {
    head: "border-b border-gray-300",
    accent: "text-gray-900",
    table: "bg-gray-100 text-gray-800",
    font: "font-sans",
  },
  modern: {
    head: "bg-emerald-50 rounded-lg",
    accent: "text-emerald-700",
    table: "bg-emerald-600 text-white",
    font: "font-sans",
  },
  retail: {
    head: "border-b-2 border-dashed border-gray-500",
    accent: "text-gray-900",
    table: "bg-gray-800 text-white",
    font: "font-mono",
  },
  wholesale: {
    head: "border-2 border-gray-700",
    accent: "text-gray-900",
    table: "bg-gray-700 text-white",
    font: "font-serif",
  },
};

export default function InvoicePreview({ d }: { d: PreviewData }) {
  const t = THEMES[d.template] ?? THEMES.professional;
  const number = `${d.prefix || "INV"}${String(1).padStart(d.padding || 5, "0")}`;
  const subtotal = SAMPLE_ITEMS.reduce((s, i) => s + i.qty * i.rate, 0);
  const hasBank = d.bank_name || d.bank_account_number || d.bank_ifsc;
  const addressLine = [d.address, d.city, d.state, d.pincode].filter(Boolean).join(", ");

  return (
    <div className={`rounded-xl border border-gray-300 bg-white p-5 text-xs text-gray-800 ${t.font}`}>
      <div className={`flex items-start justify-between gap-3 p-3 ${t.head}`}>
        <div className="flex items-center gap-3">
          {d.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.logoUrl} alt="Logo" className="h-12 w-12 object-contain" />
          )}
          <div>
            <p className={`text-base font-bold ${t.accent}`}>{d.name || "Business Name"}</p>
            {addressLine && <p>{addressLine}</p>}
            {d.mobile && <p>Mobile: {d.mobile}</p>}
            {d.gst_number && <p>GST: {d.gst_number}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className={`text-base font-bold ${t.accent}`}>INVOICE</p>
          <p>{number}</p>
          <p>Date: 01/01/2026</p>
        </div>
      </div>

      <p className="mt-3">
        <span className="font-semibold">Bill To:</span> Sample Customer
      </p>

      <table className="mt-3 w-full">
        <thead>
          <tr className={t.table}>
            <th className="p-1.5 text-left">Item</th>
            <th className="p-1.5 text-right">Qty</th>
            <th className="p-1.5 text-right">Rate</th>
            <th className="p-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {SAMPLE_ITEMS.map((i) => (
            <tr key={i.name} className="border-b border-gray-200">
              <td className="p-1.5">{i.name}</td>
              <td className="p-1.5 text-right">{i.qty}</td>
              <td className="p-1.5 text-right">₹{i.rate}</td>
              <td className="p-1.5 text-right">₹{i.qty * i.rate}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2 text-right text-sm font-bold">Total: ₹{subtotal}</p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="space-y-1">
          {hasBank && (
            <div>
              <p className="font-semibold">Bank Details</p>
              {d.bank_name && <p>{d.bank_name}</p>}
              {d.bank_account_holder && <p>A/C Name: {d.bank_account_holder}</p>}
              {d.bank_account_number && <p>A/C No: {d.bank_account_number}</p>}
              {d.bank_ifsc && <p>IFSC: {d.bank_ifsc}</p>}
            </div>
          )}
          {d.upi_id && <p>UPI: {d.upi_id}</p>}
        </div>
        <div className="text-center">
          {d.signatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.signatureUrl} alt="Signature" className="mx-auto h-10 object-contain" />
          )}
          <p className="border-t border-gray-400 pt-1">Authorized Signature</p>
        </div>
      </div>

      {d.terms && (
        <div className="mt-3">
          <p className="font-semibold">Terms &amp; Conditions</p>
          <p className="whitespace-pre-line">{d.terms}</p>
        </div>
      )}
      {d.footer && <p className="mt-3 text-center text-gray-500">{d.footer}</p>}
    </div>
  );
}