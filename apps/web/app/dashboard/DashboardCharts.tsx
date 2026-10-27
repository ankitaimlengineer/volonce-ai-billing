"use client";

import React from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DailyTrendPoint {
  date: string;
  sales: number | string;
  collections: number | string;
  expenses: number | string;
  profit: number | string;
}

interface PaymentMethodPoint {
  method: string;
  amount: number | string;
}

interface Props {
  trendData: DailyTrendPoint[];
  paymentData: PaymentMethodPoint[];
}

const PIE_COLORS = ["#047857", "#2563EB", "#D97706", "#7C3AED", "#64748B"];

export default function DashboardCharts({ trendData, paymentData }: Props) {
  const chartData = (trendData || []).map((d) => ({
    ...d,
    sales: Number(d.sales) || 0,
    collections: Number(d.collections) || 0,
    expenses: Number(d.expenses) || 0,
    profit: Number(d.profit) || 0,
  }));

  const pieData = (paymentData || []).map((p) => ({
    name: p.method,
    value: Number(p.amount) || 0,
  }));

  const totalPayment = pieData.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="space-y-6">
      {/* ૧. Sales Trend vs Collections (Area Chart) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-emerald-950 uppercase tracking-wider">
                📈 વેચાણ અને કેશ વસૂલાત (Sales & Collection Trend)
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">દિવસ-વાર વેચાણ સામે મેળવેલ રકમ</p>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold">
              <span className="flex items-center gap-1 text-emerald-700">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-600"></span> Sales (વેચાણ)
              </span>
              <span className="flex items-center gap-1 text-blue-700">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600"></span> Collection (વસૂલાત)
              </span>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#047857" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#047857" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorCol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(val: unknown) => [`₹${Number(val || 0).toLocaleString("en-IN")}`, ""]}
                  contentStyle={{ backgroundColor: "#0F172A", borderRadius: "10px", color: "#fff", fontSize: "12px", border: "none" }}
                />
                <Area type="monotone" dataKey="sales" name="વેચાણ" stroke="#047857" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSales)" />
                <Area type="monotone" dataKey="collections" name="વસૂલાત" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#colorCol)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ૨. Payment Mode Share (Donut Chart) */}
        <div className="lg:col-span-4 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-emerald-950 uppercase tracking-wider border-b border-gray-100 pb-3 mb-2">
              💳 પેમેન્ટ પદ્ધતિઓ (Payment Modes)
            </h3>
            <p className="text-xs text-gray-500">ગ્રાહકોએ કઈ રીતે નાણાં ચૂકવ્યા</p>
          </div>

          <div className="h-56 w-full flex items-center justify-center">
            {totalPayment === 0 ? (
              <p className="text-xs text-gray-400">આ સમયગાળામાં પેમેન્ટ ડેટા નથી.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: unknown) => [`₹${Number(val || 0).toLocaleString("en-IN")}`, "રકમ"]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-2 pt-2 border-t border-gray-100 text-[11px] font-semibold">
            {pieData.map((entry, idx) => (
              <span key={idx} className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-50 border">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}></span>
                {entry.name}: ₹{entry.value.toLocaleString("en-IN")}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ૩. Profit vs Expenses (Bar Chart) */}
      <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-extrabold text-emerald-950 uppercase tracking-wider">
              📊 ચોખ્ખો નફો vs દુકાનના ખર્ચા (Profit vs Expenses)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">કમાણી અને દૈનિક ખર્ચનું બેલેન્સ</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-bold">
            <span className="flex items-center gap-1 text-emerald-700">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-600"></span> Net Profit (નફો)
            </span>
            <span className="flex items-center gap-1 text-amber-700">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-600"></span> Expenses (ખર્ચ)
            </span>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(val: unknown) => [`₹${Number(val || 0).toLocaleString("en-IN")}`, ""]}
                contentStyle={{ backgroundColor: "#0F172A", borderRadius: "10px", color: "#fff", fontSize: "12px", border: "none" }}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "12px", fontWeight: "bold" }} />
              <Bar dataKey="profit" name="ચોખ્ખો નફો" fill="#047857" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="દુકાન ખર્ચ" fill="#D97706" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}