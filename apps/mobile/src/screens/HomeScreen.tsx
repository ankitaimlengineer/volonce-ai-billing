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
import { getDashboardSummary, DashboardSummary, logout, Me } from "../api";
import { colors } from "../theme";

interface HomeScreenProps {
  user: Me | null;
  onLogout: () => void;
  navigation?: any;
}

export default function HomeScreen({ user, onLogout, navigation }: HomeScreenProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSummary = async () => {
    try {
      const data = await getDashboardSummary();
      setSummary(data);
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
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary || "#2563EB"} style={{ marginTop: 40 }} />
        ) : (
          <>
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
              <View style={[styles.card, { borderLeftColor: "#F59E0B" }]}>
                <Text style={styles.cardLabel}>ગ્રાહકો પાસેથી લેવાના (Receivable)</Text>
                <Text style={[styles.cardValue, { color: "#D97706" }]}>
                  ₹ {Number(summary?.receivable || 0).toLocaleString("en-IN")}
                </Text>
                <Text style={styles.cardSub}>ઉધારી રકમ</Text>
              </View>

              {/* Payables Card */}
              <View style={[styles.card, { borderLeftColor: "#EF4444" }]}>
                <Text style={styles.cardLabel}>વેપારીને આપવાના (Payable)</Text>
                <Text style={[styles.cardValue, { color: "#DC2626" }]}>
                  ₹ {Number(summary?.payable || 0).toLocaleString("en-IN")}
                </Text>
                <Text style={styles.cardSub}>બાકી ચૂકવણી</Text>
              </View>
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

            {/* Quick Actions */}
            <Text style={styles.sectionTitle}>ઝડપી કામગીરી (Quick Actions)</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation?.navigate?.("Billing")}
              >
                <Text style={styles.actionBtnText}>+ નવું બિલ બનાવો (POS)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#475569" }]}
                onPress={() => navigation?.navigate?.("Products")}
              >
                <Text style={styles.actionBtnText}>સ્ટોક તપાસો (Products)</Text>
              </TouchableOpacity>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#334155",
    marginTop: 14,
    marginBottom: 10,
  },
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
  actionRow: { marginTop: 6, gap: 10 },
  actionBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  actionBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});