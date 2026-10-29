import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSalesReport, getProfitLossReport, getCashFlowReport } from "../api";
import { colors } from "../theme";

export default function ReportsScreen({ navigation }: any) {
  const [tab, setTab] = useState<"sales" | "pl" | "cashflow">("sales");
  const [period, setPeriod] = useState<"today" | "month" | "year">("month");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const getDateRange = () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (period === "today") return { from: today, to: today };
    if (period === "month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      return { from: first, to: today };
    }
    const firstYear = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    return { from: firstYear, to: today };
  };

  useEffect(() => {
    loadReport();
  }, [tab, period]);

  const loadReport = async () => {
    setLoading(true);
    const { from, to } = getDateRange();
    try {
      if (tab === "sales") setData(await getSalesReport(from, to));
      else if (tab === "pl") setData(await getProfitLossReport(from, to));
      else setData(await getCashFlowReport(from, to));
    } catch (e: any) {
      console.log("Report error:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા</Text>
        </TouchableOpacity>
        <Text style={styles.title}>નાણાકીય રિપોર્ટ્સ (Reports)</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === "sales" && styles.tabActive]} onPress={() => setTab("sales")}>
          <Text style={[styles.tabText, tab === "sales" && styles.tabTextActive]}>📈 વેચાણ (Sales)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "pl" && styles.tabActive]} onPress={() => setTab("pl")}>
          <Text style={[styles.tabText, tab === "pl" && styles.tabTextActive]}>⚖️ નફો (P&L)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "cashflow" && styles.tabActive]} onPress={() => setTab("cashflow")}>
          <Text style={[styles.tabText, tab === "cashflow" && styles.tabTextActive]}>💵 કેશ ફ્લો</Text>
        </TouchableOpacity>
      </View>

      {/* Period Filter */}
      <View style={styles.periodRow}>
        <TouchableOpacity style={[styles.pBtn, period === "today" && styles.pBtnActive]} onPress={() => setPeriod("today")}>
          <Text style={[styles.pText, period === "today" && styles.pTextActive]}>આજે (Today)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.pBtn, period === "month" && styles.pBtnActive]} onPress={() => setPeriod("month")}>
          <Text style={[styles.pText, period === "month" && styles.pTextActive]}>આ મહિને (Month)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.pBtn, period === "year" && styles.pBtnActive]} onPress={() => setPeriod("year")}>
          <Text style={[styles.pText, period === "year" && styles.pTextActive]}>આ વર્ષે (Year)</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14 }}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* 1. SALES REPORT */}
            {tab === "sales" && data && (
              <View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>ચોખ્ખું વેચાણ (Net Sales):</Text>
                  <Text style={styles.metricVal}>₹ {Number(data.net_sales || 0).toFixed(2)}</Text>
                  <Text style={styles.metricSub}>કુલ વેચાણ: ₹{data.total_sales} • રિટર્ન: ₹{data.sales_return}</Text>
                </View>

                <Text style={styles.secTitle}>🛍️ સૌથી વધુ વેચાયેલી પ્રોડક્ટ્સ</Text>
                {(data.products || []).slice(0, 10).map((p: any, idx: number) => (
                  <View key={idx} style={styles.rowCard}>
                    <Text style={styles.rowName}>{p.name} (જથ્થો: {p.quantity})</Text>
                    <Text style={styles.rowAmt}>₹ {p.amount}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* 2. PROFIT & LOSS REPORT */}
            {tab === "pl" && data && (
              <View>
                <View style={styles.plCard}>
                  <Text style={styles.plTitle}>📑 નફો અને નુકસાન હિસાબ</Text>
                  <View style={styles.plRow}><Text style={styles.plLabel}>કુલ વેચાણ:</Text><Text style={styles.plVal}>₹ {data.sales}</Text></View>
                  <View style={styles.plRow}><Text style={styles.plLabel}>માલની ખરીદ પડતર (COGS):</Text><Text style={styles.plVal}>- ₹ {data.cogs}</Text></View>
                  <View style={[styles.plRow, { backgroundColor: "#ECFDF5", padding: 6, borderRadius: 6 }]}>
                    <Text style={[styles.plLabel, { fontWeight: "800", color: "#065F46" }]}>કુલ નફો (Gross Profit):</Text>
                    <Text style={[styles.plVal, { fontWeight: "900", color: "#065F46" }]}>₹ {data.gross_profit} ({data.margin_percent}%)</Text>
                  </View>
                  <View style={styles.plRow}><Text style={styles.plLabel}>દુકાનના ખર્ચા (Expenses):</Text><Text style={styles.plVal}>- ₹ {data.expenses}</Text></View>
                  <View style={[styles.plRow, { backgroundColor: "#047857", padding: 10, borderRadius: 8, marginTop: 10 }]}>
                    <Text style={{ color: "#fff", fontWeight: "800" }}>ચોખ્ખો નફો (NET PROFIT):</Text>
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>₹ {data.net_profit}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* 3. CASH FLOW REPORT */}
            {tab === "cashflow" && data && (
              <View>
                <View style={styles.cfCard}>
                  <Text style={styles.cfLabel}>ચોખ્ખો કેશ ફ્લો (Net Cash Flow):</Text>
                  <Text style={styles.cfVal}>₹ {data.net}</Text>
                  <Text style={styles.cfSub}>કુલ આવક: ₹{data.total_in} • કુલ જાવક: ₹{data.total_out}</Text>
                </View>

                <Text style={styles.secTitle}>💳 પદ્ધતિ વાઇઝ આવક-જાવક</Text>
                {(data.by_method || []).map((m: any, idx: number) => (
                  <View key={idx} style={styles.rowCard}>
                    <Text style={styles.rowName}>{m.method.toUpperCase()}</Text>
                    <Text style={styles.rowAmt}>+₹{m.in} / -₹{m.out} (નેટ: ₹{m.net})</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  backBtn: { marginRight: 12 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  tabs: { flexDirection: "row", backgroundColor: "#fff", padding: 6, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  tab: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
  tabActive: { backgroundColor: "#ECFDF5" },
  tabText: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  tabTextActive: { color: "#047857", fontWeight: "800" },
  periodRow: { flexDirection: "row", padding: 10, gap: 8, backgroundColor: "#fff" },
  pBtn: { flex: 1, paddingVertical: 6, alignItems: "center", borderRadius: 6, borderWidth: 1, borderColor: "#CBD5E1" },
  pBtnActive: { backgroundColor: "#047857", borderColor: "#047857" },
  pText: { fontSize: 11, fontWeight: "700", color: "#475569" },
  pTextActive: { color: "#fff" },
  metricCard: { backgroundColor: "#047857", padding: 18, borderRadius: 14, marginBottom: 16 },
  metricLabel: { color: "#D1FAE5", fontSize: 12, fontWeight: "700" },
  metricVal: { color: "#FFFFFF", fontSize: 26, fontWeight: "900", marginVertical: 4 },
  metricSub: { color: "#A7F3D0", fontSize: 11 },
  plCard: { backgroundColor: "#fff", padding: 16, borderRadius: 14, elevation: 1 },
  plTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A", marginBottom: 12, textAlign: "center" },
  plRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  plLabel: { fontSize: 13, color: "#334155" },
  plVal: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  cfCard: { backgroundColor: "#0284C7", padding: 18, borderRadius: 14, marginBottom: 16 },
  cfLabel: { color: "#E0F2FE", fontSize: 12, fontWeight: "700" },
  cfVal: { color: "#fff", fontSize: 26, fontWeight: "900", marginVertical: 4 },
  cfSub: { color: "#BAE6FD", fontSize: 11 },
  secTitle: { fontSize: 14, fontWeight: "800", color: "#334155", marginVertical: 10 },
  rowCard: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#fff", padding: 12, borderRadius: 8, marginBottom: 6 },
  rowName: { fontSize: 12, fontWeight: "700", color: "#1E293B" },
  rowAmt: { fontSize: 12, fontWeight: "800", color: "#047857" },
});