import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getDashboardSummary, DashboardSummary, Me } from "../api";
import { getOfflineDrafts } from "../offline";
import { colors } from "../theme";

interface HomeScreenProps {
  user: Me | null;
  onLogout: () => void;
  navigation: any;
}

export default function HomeScreen({ user, onLogout, navigation }: HomeScreenProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);

  const fetchSummary = async () => {
    try {
      const [data, drafts] = await Promise.all([
        getDashboardSummary(),
        getOfflineDrafts(),
      ]);
      setSummary(data);
      setOfflineCount(drafts.length);
    } catch (err) {
      console.log("Summary fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSummary();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>નમસ્તે, {user?.full_name || "વેપારી મિત્ર"}</Text>
          <Text style={styles.subText}>VOLONCE AI BILLING</Text>
        </View>
        <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Offline Draft Alert Badge */}
        {offlineCount > 0 && (
          <TouchableOpacity
            style={styles.offlineBanner}
            onPress={() => navigation?.navigate?.("OfflineDrafts")}
            activeOpacity={0.8}
          >
            <Text style={styles.offlineBannerText}>
              📶 {offlineCount} ઑફલાઇન બિલો સિંક કરવાના બાકી છે! (અહીં ક્લિક કરો →)
            </Text>
          </TouchableOpacity>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary || "#047857"} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Quick Actions (મુખ્ય કામગીરી બટન્સ) */}
            <Text style={styles.sectionTitle}>ઝડપી કામગીરી (Quick Actions)</Text>
            <View style={styles.actionRow}>
              {/* ૧. મુખ્ય ફીચર: AI કેમેરા બિલિંગ */}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#047857" }]}
                onPress={() => navigation?.navigate?.("AiCamera")}
              >
                <Text style={styles.actionBtnText}>📸 AI કેમેરા બિલ (Smart Scan)</Text>
                <Text style={styles.actionBtnSubText}>ફોટો પાડીને ૧-ક્લિકમાં બિલ બનાવો</Text>
              </TouchableOpacity>

              {/* ૨. સાદું POS બિલિંગ */}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#2563EB" }]}
                onPress={() => navigation?.navigate?.("Billing")}
              >
                <Text style={styles.actionBtnText}>+ સાદું બિલ (Manual POS)</Text>
                <Text style={styles.actionBtnSubText}>પ્રોડક્ટ પસંદ કરીને બિલ બનાવો</Text>
              </TouchableOpacity>

              {/* ૩. ગ્રાહકો અને ઉધારી ખાતાવહી */}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#0F172A" }]}
                onPress={() => navigation?.navigate?.("Customers")}
              >
                <Text style={styles.actionBtnText}>👤 ગ્રાહકો અને ઉધારી (Khata)</Text>
                <Text style={styles.actionBtnSubText}>ખાતાવહી જુઓ અને પેમેન્ટ જમા કરો</Text>
              </TouchableOpacity>

              {/* ૪. વેપારીઓ અને ખરીદી */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: "#0284C7" }]}
                  onPress={() => navigation?.navigate?.("Purchases")}
                >
                  <Text style={styles.smallBtnText}>🛒 ખરીદી (Purchase)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: "#7C3AED" }]}
                  onPress={() => navigation?.navigate?.("Suppliers")}
                >
                  <Text style={styles.smallBtnText}>🏢 વેપારીઓ (Suppliers)</Text>
                </TouchableOpacity>
              </View>

              {/* ૫. સ્ટોક અને ખર્ચા */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: "#475569" }]}
                  onPress={() => navigation?.navigate?.("Products")}
                >
                  <Text style={styles.smallBtnText}>📦 સ્ટોક (Products)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: "#B45309" }]}
                  onPress={() => navigation?.navigate?.("Expenses")}
                >
                  <Text style={styles.smallBtnText}>📝 ખર્ચા (Expenses)</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Stats Grid */}
            <Text style={styles.sectionTitle}>આજનો હિસાબ (Today's Overview)</Text>

            <View style={styles.grid}>
              {/* Sales Card */}
              <View style={[styles.card, { borderLeftColor: "#10B981" }]}>
                <Text style={styles.cardLabel}>આજનું વેચાણ (Sales)</Text>
                <Text style={styles.cardValue}>₹ {Number(summary?.sales || 0).toLocaleString("en-IN")}</Text>
                <Text style={styles.cardSub}>{summary?.bills || 0} બિલો બન્યા</Text>
              </View>

              {/* Net Profit Card */}
              <View style={[styles.card, { borderLeftColor: "#3B82F6" }]}>
                <Text style={styles.cardLabel}>ચોખ્ખો નફો (Net Profit)</Text>
                <Text style={styles.cardValue}>₹ {Number(summary?.net_profit || 0).toLocaleString("en-IN")}</Text>
                <Text style={styles.cardSub}>Margin: {summary?.margin_percent || 0}%</Text>
              </View>

              {/* Receivables Card */}
              <TouchableOpacity
                style={[styles.card, { borderLeftColor: "#F59E0B" }]}
                onPress={() => navigation?.navigate?.("Customers")}
                activeOpacity={0.7}
              >
                <Text style={styles.cardLabel}>ગ્રાહકો પાસેથી લેવાના</Text>
                <Text style={[styles.cardValue, { color: "#D97706" }]}>
                  ₹ {Number(summary?.receivable || 0).toLocaleString("en-IN")}
                </Text>
                <Text style={styles.cardSub}>ઉધારી રકમ (જુઓ →)</Text>
              </TouchableOpacity>

              {/* Payables Card */}
              <TouchableOpacity
                style={[styles.card, { borderLeftColor: "#EF4444" }]}
                onPress={() => navigation?.navigate?.("Suppliers")}
                activeOpacity={0.7}
              >
                <Text style={styles.cardLabel}>વેપારીઓને આપવાના</Text>
                <Text style={[styles.cardValue, { color: "#DC2626" }]}>
                  ₹ {Number(summary?.payable || 0).toLocaleString("en-IN")}
                </Text>
                <Text style={styles.cardSub}>દેવું રકમ (જુઓ →)</Text>
              </TouchableOpacity>
            </View>

            {/* Inventory Alerts */}
            <Text style={styles.sectionTitle}>સ્ટોક એલર્ટ (Stock Alerts)</Text>
            <View style={styles.stockRow}>
              <View style={[styles.alertCard, { backgroundColor: "#FEF2F2" }]}>
                <Text style={[styles.alertNumber, { color: "#EF4444" }]}>{summary?.out_of_stock || 0}</Text>
                <Text style={styles.alertText}>સ્ટોક ખલાસ (Out of Stock)</Text>
              </View>
              <View style={[styles.alertCard, { backgroundColor: "#FFFBEB" }]}>
                <Text style={[styles.alertNumber, { color: "#F59E0B" }]}>{summary?.low_stock || 0}</Text>
                <Text style={styles.alertText}>ઓછો સ્ટોક (Low Stock)</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  welcomeText: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
  subText: { fontSize: 12, color: "#64748B", marginTop: 2, fontWeight: "600" },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#FEE2E2",
  },
  logoutText: { color: "#EF4444", fontWeight: "600", fontSize: 12 },
  scrollContent: { padding: 16 },
  offlineBanner: {
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#F59E0B",
    elevation: 2,
  },
  offlineBannerText: {
    color: "#92400E",
    fontWeight: "800",
    fontSize: 13,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#334155",
    marginTop: 10,
    marginBottom: 10,
  },
  actionRow: { marginBottom: 10, gap: 10 },
  actionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  actionBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  actionBtnSubText: { color: "#F1F5F9", fontSize: 11, marginTop: 2, fontWeight: "500" },
  smallBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    elevation: 1,
  },
  smallBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  card: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  cardLabel: { fontSize: 12, color: "#64748B", fontWeight: "500" },
  cardValue: { fontSize: 18, fontWeight: "800", color: "#0F172A", marginVertical: 6 },
  cardSub: { fontSize: 11, color: "#94A3B8" },
  stockRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  alertCard: {
    width: "48%",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  alertNumber: { fontSize: 22, fontWeight: "800" },
  alertText: { fontSize: 12, color: "#475569", marginTop: 4, fontWeight: "500" },
});