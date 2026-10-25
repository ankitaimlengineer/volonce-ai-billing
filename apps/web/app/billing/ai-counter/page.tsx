"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { authGet, authPost } from "@/lib/api";
import WebcamCaptureModal from "@/app/components/WebcamCaptureModal";

interface ScannedItem {
  raw_name: string;
  matched_product_id: string | null;
  matched_product_name: string | null;
  confidence: number;
  quantity: number;
  rate: number;
  tax_percent: number;
  total: number;
}

interface Product {
  id: string;
  name: string;
  selling_price: string;
  tax_percent: string;
}

interface MatchedCustomer {
  id: string;
  name: string;
  mobile: string | null;
  outstanding: number;
  confidence: number;
}

interface CustomerOption {
  id: string;
  name: string;
  mobile: string | null;
  outstanding: string;
}

export default function QuickAiCounterPage() {
  const router = useRouter();

  // Mode: Cash vs Udhar
  const [billType, setBillType] = useState<"cash" | "credit">("cash");

  // Camera Modal Control
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<"product" | "customer">("product");

  // Photo 1: Product Scan States
  const [productImage, setProductImage] = useState<string | null>(null);
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [scanningProducts, setScanningProducts] = useState(false);
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  // Photo 2: Customer Face Recognition States
  const [customerImage, setCustomerImage] = useState<string | null>(null);
  const [matchingFace, setMatchingFace] = useState(false);
  const [recognizedCustomer, setRecognizedCustomer] = useState<MatchedCustomer | null>(null);
  const [customerBlobForNew, setCustomerBlobForNew] = useState<Blob | null>(null);

  // Manual Customer fallback
  const [customersList, setCustomersList] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  // New Customer Form (if face not recognized)
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustMobile, setNewCustMobile] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Load catalog & customers on start
  useEffect(() => {
    async function loadData() {
      try {
        const [prodRes, custRes] = await Promise.all([
          authGet<{ items: Product[] }>("/api/v1/products?page_size=100"),
          authGet<{ items: CustomerOption[] }>("/api/v1/customers?page_size=100"),
        ]);
        setAllProducts(prodRes.items || []);
        setCustomersList(custRes.items || []);
      } catch (err) {
        console.error("Initial load error", err);
      }
    }
    loadData();
  }, []);

  // Update Item Quantity (+ / - / Manual Typing) & Auto-Recalculate Tax & Total
  const updateQty = (index: number, newQty: number) => {
    if (newQty < 1) return;
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const rate = Number(item.rate) || 0;
        const taxPct = Number(item.tax_percent) || 0;
        const base = rate * newQty;
        const tax = (base * taxPct) / 100;
        return {
          ...item,
          quantity: newQty,
          total: Math.round((base + tax) * 100) / 100,
        };
      })
    );
  };

  // Remove Item
  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Handle Photo Captured from Camera Modal
  const handlePhotoCaptured = async (blob: Blob, dataUrl: string) => {
    if (cameraTarget === "product") {
      setProductImage(dataUrl);
      scanProductsFromImage(blob);
    } else {
      setCustomerImage(dataUrl);
      setCustomerBlobForNew(blob);
      matchCustomerFromFace(blob);
    }
  };

  // 1. Send Product Image to Gemini AI Vision
  const scanProductsFromImage = async (blob: Blob) => {
    setScanningProducts(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", blob, "counter_scan.jpg");

      const token = localStorage.getItem("access_token");
      const res = await fetch("http://localhost:8000/api/v1/ai/scan-bill", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) throw new Error("પ્રોડક્ટ સ્કેન નિષ્ફળ ગયું");
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error(err);
      setError("પ્રોડક્ટ્સ ઓળખવામાં સમસ્યા આવી. ફરી ફોટો લો.");
    } finally {
      setScanningProducts(false);
    }
  };

  // 2. Send Customer Face Photo to Face Recognition AI
  const matchCustomerFromFace = async (blob: Blob) => {
    setMatchingFace(true);
    setIsNewCustomer(false);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", blob, "face_scan.jpg");

      const token = localStorage.getItem("access_token");
      const res = await fetch("http://localhost:8000/api/v1/ai/match-customer-face", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) throw new Error("ફેસ મેચ નિષ્ફળ ગયું");
      const data = await res.json();

      if (data.matched && data.customer) {
        setRecognizedCustomer(data.customer);
        setSelectedCustomerId(data.customer.id);
      } else {
        setRecognizedCustomer(null);
        setIsNewCustomer(true);
      }
    } catch (err) {
      console.error(err);
      setIsNewCustomer(true);
    } finally {
      setMatchingFace(false);
    }
  };

  // Quick Register New Customer with Face Photo
  const handleSaveNewCustomer = async () => {
    if (!newCustName.trim()) {
      alert("ગ્રાહકનું નામ લખો");
      return;
    }
    try {
      const newCust = await authPost<CustomerOption>("/api/v1/customers", {
        name: newCustName.trim(),
        mobile: newCustMobile.trim() || null,
        customer_type: "retail",
        opening_balance: "0",
      });

      if (customerBlobForNew) {
        const formData = new FormData();
        formData.append("file", customerBlobForNew, "face.jpg");
        const token = localStorage.getItem("access_token");
        await fetch(`http://localhost:8000/api/v1/ai/register-customer-face/${newCust.id}`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
      }

      setRecognizedCustomer({
        id: newCust.id,
        name: newCust.name,
        mobile: newCust.mobile,
        outstanding: 0,
        confidence: 100,
      });
      setSelectedCustomerId(newCust.id);
      setIsNewCustomer(false);
      alert(`✓ ${newCust.name} નું ખાતું અને ચહેરો ભવિષ્ય માટે સેવ થઈ ગયા છે!`);
    } catch (e) {
      alert("ગ્રાહક સેવ કરવામાં સમસ્યા આવી");
    }
  };

  // Calculate Totals in Real-time
  const grandTotal = useMemo(() => {
    return items.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
  }, [items]);

  // One-Click Fast Bill Creation
  const handleFastCheckout = async () => {
    if (items.length === 0) {
      setError("કાઉન્ટર પરથી ઓછામાં ઓછી ૧ પ્રોડક્ટ સ્કેન કરો.");
      return;
    }

    if (billType === "credit" && !selectedCustomerId) {
      setError("ઉધાર બિલ બનાવવા માટે ગ્રાહકનો ચહેરો સ્કેન કરો અથવા લિસ્ટમાંથી પસંદ કરો.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payments = billType === "cash" ? [{ method: "cash", amount: grandTotal }] : [];

      const payload = {
        customer_id: selectedCustomerId || null,
        items: items.map((i) => ({
          product_id: i.matched_product_id || allProducts[0]?.id,
          quantity: i.quantity,
          discount_percent: 0,
        })),
        payments,
      };

      const idempotencyKey = "fast-" + crypto.randomUUID();
      const res = await authPost<{ id: string }>("/api/v1/invoices", payload, {
        "Idempotency-Key": idempotencyKey,
      });

      router.push(`/invoices/${res.id}`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || "બિલ બનાવવામાં સમસ્યા આવી");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-emerald-50/40 p-4 md:p-6">
      {/* Top Bar */}
      <div className="mx-auto max-w-7xl mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg border border-emerald-700 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 shadow-sm"
          >
            ← Dashboard
          </Link>
          <h1 className="text-xl md:text-2xl font-black text-emerald-950 flex items-center gap-2">
            ⚡ Quick AI Cashier (સ્માર્ટ કાઉન્ટર)
          </h1>
        </div>

        {/* Big Switch: Cash vs Udhar */}
        <div className="flex rounded-xl bg-white p-1 border-2 border-emerald-700 shadow-sm">
          <button
            type="button"
            onClick={() => setBillType("cash")}
            className={`rounded-lg px-5 py-2 text-xs md:text-sm font-extrabold transition ${
              billType === "cash"
                ? "bg-emerald-700 text-white shadow-md"
                : "text-gray-600 hover:text-emerald-800"
            }`}
          >
            💵 રોકડ બિલ (Cash)
          </button>
          <button
            type="button"
            onClick={() => setBillType("credit")}
            className={`rounded-lg px-5 py-2 text-xs md:text-sm font-extrabold transition ${
              billType === "credit"
                ? "bg-amber-600 text-white shadow-md"
                : "text-gray-600 hover:text-amber-700"
            }`}
          >
            📒 ઉધાર બિલ (Credit)
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-auto max-w-7xl mb-4 rounded-xl bg-red-50 p-3.5 border border-red-200 text-sm font-bold text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* Main 2-Camera Action Workspace */}
      <div className="mx-auto max-w-7xl grid grid-cols-1 gap-6 lg:grid-cols-12">
        
        {/* STEP 1: Counter Products Photo (Left Side) */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl bg-white p-5 shadow-md border-2 border-emerald-700/60">
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-800">
                પગલું ૧: કાઉન્ટર પર સામાન
              </span>
              <button
                type="button"
                onClick={() => {
                  setCameraTarget("product");
                  setIsCameraOpen(true);
                }}
                className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-800 transition"
              >
                📸 સામાનનો ફોટો પાડો (Scan Items)
              </button>
            </div>

            {/* Product Visual Area */}
            {productImage ? (
              <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-2 border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={productImage} alt="Products" className="h-16 w-24 rounded-lg object-contain bg-black" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-emerald-950">✓ સામાનનો ફોટો સ્કેન થઈ ગયો છે</p>
                  <p className="text-[11px] text-gray-500">જથ્થો વધારવા કે ઘટાડવા માટે + અથવા - દબાવો</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCameraTarget("product");
                    setIsCameraOpen(true);
                  }}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-white"
                >
                  🔄 ફરી ફોટો લો
                </button>
              </div>
            ) : (
              <div
                onClick={() => {
                  setCameraTarget("product");
                  setIsCameraOpen(true);
                }}
                className="mb-4 cursor-pointer rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50/30 p-8 text-center hover:bg-emerald-50 transition"
              >
                <span className="text-3xl block mb-1">🛍️</span>
                <p className="text-sm font-bold text-emerald-900">કાઉન્ટર પર રાખેલા સામાનનો ફોટો પાડવા અહીં ક્લિક કરો</p>
                <p className="text-xs text-gray-500 mt-0.5">AI આપોઆપ બોક્સ, પેકેટ કે વસ્તુઓ ઓળખી લેશે</p>
              </div>
            )}

            {/* Recognized Items Table with Real-time Quantity Editor */}
            {scanningProducts ? (
              <div className="py-12 text-center text-emerald-800 text-sm font-bold animate-pulse">
                🤖 AI સામાન ઓળખી રહ્યું છે... કૃપા કરીને થોડી સેકન્ડ રાહ જુઓ.
              </div>
            ) : items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 uppercase font-extrabold">
                      <th className="py-2.5">પ્રોડક્ટ</th>
                      <th className="py-2.5 text-center w-36">જથ્થો (QTY)</th>
                      <th className="py-2.5 text-right">દર (Rate)</th>
                      <th className="py-2.5 text-right">રકમ</th>
                      <th className="py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition">
                        <td className="py-3 font-bold text-gray-900">
                          {it.raw_name}
                          <span className="ml-2 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-bold">
                            {it.confidence.toFixed(0)}%
                          </span>
                        </td>

                        {/* Interactive Quantity Box: [-] [ 1 ] [+] */}
                        <td className="py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateQty(idx, it.quantity - 1)}
                              className="h-7 w-7 rounded-lg bg-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-300 active:scale-95 transition"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={it.quantity}
                              onChange={(e) => updateQty(idx, Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-12 text-center font-bold text-gray-900 border border-gray-300 rounded-lg py-1 font-mono text-xs focus:ring-1 focus:ring-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={() => updateQty(idx, it.quantity + 1)}
                              className="h-7 w-7 rounded-lg bg-emerald-700 text-sm font-bold text-white hover:bg-emerald-800 active:scale-95 transition"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="py-3 text-right font-mono text-gray-700 font-semibold">
                          ₹{Number(it.rate).toFixed(2)}
                        </td>

                        <td className="py-3 text-right font-black text-emerald-900 font-mono text-sm">
                          ₹{Number(it.total).toFixed(2)}
                        </td>

                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="text-gray-400 hover:text-red-500 text-sm font-bold ml-2 p-1"
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
            ) : (
              <p className="text-center py-6 text-xs text-gray-400">હજુ કોઈ વસ્તુ સ્કેન થયેલી નથી</p>
            )}
          </div>

          <div className="mt-4 border-t border-gray-100 pt-3 flex justify-between items-center text-sm font-bold">
            <span className="text-gray-500">સામાનની કુલ કિંમત:</span>
            <span className="text-2xl font-black text-emerald-900 font-mono">₹{grandTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* STEP 2: Customer Face Scan (Right Side) */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl bg-white p-5 shadow-md border-2 border-emerald-700/60">
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-800">
                પગલું ૨: ગ્રાહકનો ચહેરો (Face Scan)
              </span>
              <button
                type="button"
                onClick={() => {
                  setCameraTarget("customer");
                  setIsCameraOpen(true);
                }}
                className="flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-indigo-800 transition"
              >
                👤 ચહેરો સ્કેન કરો (Scan Face)
              </button>
            </div>

            {/* Customer Photo Area */}
            {customerImage ? (
              <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 p-2 border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={customerImage} alt="Customer Face" className="h-16 w-16 rounded-full object-cover border-2 border-indigo-500 shadow" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-900">ગ્રાહકનો ફોટો કેપ્ચર થયો</p>
                  <p className="text-[11px] text-gray-500">AI ચહેરો ઓળખી રહ્યું છે</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCameraTarget("customer");
                    setIsCameraOpen(true);
                  }}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-white"
                >
                  🔄 ફરી લો
                </button>
              </div>
            ) : (
              <div
                onClick={() => {
                  setCameraTarget("customer");
                  setIsCameraOpen(true);
                }}
                className="mb-4 cursor-pointer rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/30 p-8 text-center hover:bg-indigo-50 transition"
              >
                <span className="text-3xl block mb-1">👤</span>
                <p className="text-sm font-bold text-indigo-950">ગ્રાહકના ચહેરાનો ફોટો લેવા અહીં ક્લિક કરો</p>
                <p className="text-xs text-gray-500 mt-0.5">AI આપોઆપ ખાતું અને જૂની ઉધારી શોધી લેશે</p>
              </div>
            )}

            {/* Recognized Customer Display */}
            {matchingFace ? (
              <div className="py-6 text-center text-indigo-700 text-xs font-bold animate-pulse">
                🔍 ચહેરો મેળવી રહ્યા છીએ... કૃપા કરીને રાહ જુઓ.
              </div>
            ) : recognizedCustomer ? (
              <div className="rounded-xl bg-emerald-50 p-4 border border-emerald-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                    ✓ ઓળખાયેલ ગ્રાહક (AI Matched {recognizedCustomer.confidence.toFixed(0)}%)
                  </span>
                </div>
                <p className="text-lg font-black text-emerald-950 mt-2">{recognizedCustomer.name}</p>
                {recognizedCustomer.mobile && (
                  <p className="text-xs text-emerald-800 font-semibold mt-0.5">📞 +91 {recognizedCustomer.mobile}</p>
                )}
                <div className="mt-3 flex justify-between items-center rounded-lg bg-white p-2 border border-emerald-200 text-xs font-bold">
                  <span className="text-gray-600">જૂની બાકી ઉધારી:</span>
                  <span className={recognizedCustomer.outstanding > 0 ? "text-red-600" : "text-emerald-700"}>
                    ₹{recognizedCustomer.outstanding.toFixed(2)}
                  </span>
                </div>
              </div>
            ) : isNewCustomer ? (
              <div className="rounded-xl bg-amber-50 p-4 border border-amber-200">
                <span className="text-xs font-extrabold text-amber-900 block mb-1">
                  ⚠️ નવો ચહેરો! ગ્રાહકની વિગત લખો (ભવિષ્ય માટે સેવ થઈ જશે):
                </span>
                <input
                  type="text"
                  placeholder="ગ્રાહકનું નામ (દા.ત. રમેશ પટેલ)"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-amber-300 bg-white p-2 text-xs font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="text"
                  placeholder="મોબાઈલ નંબર (10 અંક)"
                  value={newCustMobile}
                  onChange={(e) => setNewCustMobile(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-amber-300 bg-white p-2 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={handleSaveNewCustomer}
                  className="mt-3 w-full rounded-lg bg-amber-700 py-2 text-xs font-bold text-white shadow hover:bg-amber-800"
                >
                  ✓ ચહેરો અને નામ સેવ કરો
                </button>
              </div>
            ) : (
              /* Manual Customer Picker Fallback */
              <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs">
                <span className="text-[11px] font-bold text-gray-600 block mb-1">
                  અથવા લિસ્ટમાંથી ગ્રાહક પસંદ કરો:
                </span>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value);
                    const found = customersList.find((c) => c.id === e.target.value);
                    if (found) {
                      setRecognizedCustomer({
                        id: found.id,
                        name: found.name,
                        mobile: found.mobile,
                        outstanding: Number(found.outstanding) || 0,
                        confidence: 100,
                      });
                    }
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white p-2 text-xs font-semibold text-gray-800"
                >
                  <option value="">Walk-in Customer (રોકડ ગ્રાહક)</option>
                  {customersList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.mobile ? `(${c.mobile})` : ""} {Number(c.outstanding) > 0 ? `[બાકી: ₹${c.outstanding}]` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Customer Summary status */}
          <div className="mt-4 border-t border-gray-100 pt-3 flex justify-between items-center text-xs">
            <span className="text-gray-500">ગ્રાહક:</span>
            <span className="font-bold text-slate-900">
              {recognizedCustomer ? recognizedCustomer.name : "Walk-in Customer"}
            </span>
          </div>
        </div>

      </div>

      {/* FINAL FLOATING CHECKOUT BAR */}
      <div className="mx-auto max-w-7xl mt-6 rounded-2xl bg-emerald-800 p-5 text-white shadow-xl flex flex-wrap items-center justify-between gap-4 border-2 border-emerald-900">
        <div>
          <span className="text-xs uppercase font-extrabold tracking-wider text-emerald-200">
            {billType === "cash" ? "💵 રોકડ બિલ (ચૂકતે)" : "📒 ઉધાર બિલ (ખાતામાં)"}
          </span>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-black font-mono">₹{grandTotal.toFixed(2)}</p>
            <span className="text-xs text-emerald-100">
              ({items.length} વસ્તુઓ) • {recognizedCustomer ? recognizedCustomer.name : "Walk-in"}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleFastCheckout}
          disabled={submitting || items.length === 0}
          className="flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-black text-emerald-900 shadow-lg hover:bg-emerald-50 disabled:opacity-50 transition"
        >
          {submitting ? "બિલ બની રહ્યું છે..." : "⚡ ૧-ક્લિકમાં બિલ બનાવો અને મોકલો →"}
        </button>
      </div>

      {/* Shared Camera Modal */}
      <WebcamCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handlePhotoCaptured}
      />
    </main>
  );
}