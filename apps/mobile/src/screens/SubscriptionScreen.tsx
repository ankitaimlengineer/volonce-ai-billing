import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSubscriptionStatus, getSubscriptionPlans, redeemVoucherCode } from "../api";
import { colors } from "../theme";

export default function SubscriptionScreen({ navigation }: any) {
  const [statusData, setStatusData] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [sRes, pRes] = await Promise.all([
        getSubscriptionStatus(),
        getSubscriptionPlans(),
      ]);
      setStatusData(sRes);
      setPlans((pRes || []).filter((p: any) => p.slug !== "free_trial"));
    } catch (e: any) {
      console.log("Sub error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = async () => {
    if (!code.trim()) return Alert.alert("ભૂલ", "કૂપન અથવા લાઈસન્સ કોડ લખો.");
    setRedeeming(true);
    try {
      const res = await redeemVoucherCode(code.trim());
      Alert.alert("અભિનંદન! 🎉", res.message || "પ્લાન સક્રિય થઈ ગયો છે!");
      setCode("");
      loadData();
    } catch (err: any) {
      Alert.alert("ભૂલ", err.message || "અમાન્ય કૂપન કોડ.");
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા</Text>
        </TouchableOpacity>
        <Text style={styles.title}>સબસ્ક્રિપ્શન અને પ્લાન (Pricing)</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14 }}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Status Banner */}
            {statusData && (
              <View style={[styles.statusCard, statusData.is_active ? styles.cardActive : styles.cardExpired]}>
                <Text style={styles.badgeText}>
                  {statusData.is_active ? (statusData.is_trial ? "✓ Free Trial સક્રિય છે" : "✓ સક્રિય સબસ્ક્રિપ્શન") : "⚠️ પ્લાન સમાપ્ત થયેલ છે"}
                </Text>
                <Text style={styles.planName}>{statusData.plan_name}</Text>
                <Text style={styles.daysLeft}>{statusData.days_left} દિવસ બાકી</Text>
              </View>
            )}

            {/* Voucher Box */}
            <View style={styles.voucherBox}>
              <Text style={styles.vTitle}>🏷️ વાઉચર અથવા લાઈસન્સ કોડ રિડીમ કરો</Text>
              <Text style={styles.vSub}>જો તમારી પાસે કોડ હોય તો અહીં લખીને ૧-ક્લિકમાં પ્લાન અનલોક કરો.</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TextInput
                  style={styles.vInput}
                  placeholder="દા.ત. YEARLY2026, VOLONIS-365"
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                />
                <TouchableOpacity style={styles.vBtn} onPress={handleRedeem} disabled={redeeming}>
                  {redeeming ? <ActivityIndicator color="#fff" /> : <Text style={styles.vBtnText}>રિડીમ</Text>}
                </TouchableOpacity>
              </View>
            </View>

            {/* Plans List */}
            <Text style={styles.secTitle}>ઉપલબ્ધ સબસ્ક્રિપ્શન પ્લાન</Text>
            {plans.map((p) => (
              <View key={p.id} style={styles.planCard}>
                <Text style={styles.pName}>{p.name}</Text>
                <Text style={styles.pPrice}>₹ {Number(p.price).toFixed(0)} <Text style={{ fontSize: 12, color: "#64748B" }}>/ {p.duration_days} દિવસ</Text></Text>
                <Text style={styles.pDesc}>{p.description}</Text>
                <Text style={styles.feature}>✓ અનલિમિટેડ બિલિંગ & કેમેરા AI</Text>
                <Text style={styles.feature}>✓ WhatsApp PDF અને ઓટો-મેચ</Text>
              </View>
            ))}
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
  statusCard: { padding: 18, borderRadius: 14, marginBottom: 14 },
  cardActive: { backgroundColor: "#047857" },
  cardExpired: { backgroundColor: "#DC2626" },
  badgeText: { color: "#D1FAE5", fontSize: 11, fontWeight: "700" },
  planName: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginVertical: 4 },
  daysLeft: { color: "#A7F3D0", fontSize: 13, fontWeight: "700" },
  voucherBox: { backgroundColor: "#fff", padding: 14, borderRadius: 12, marginBottom: 14, elevation: 1 },
  vTitle: { fontSize: 13, fontWeight: "800", color: "#0F172A" },
  vSub: { fontSize: 11, color: "#64748B", marginTop: 2 },
  vInput: { flex: 1, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, padding: 8, fontSize: 13, fontWeight: "700" },
  vBtn: { backgroundColor: "#047857", paddingHorizontal: 16, justifyContent: "center", borderRadius: 8 },
  vBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  secTitle: { fontSize: 15, fontWeight: "800", color: "#334155", marginVertical: 10 },
  planCard: { backgroundColor: "#fff", padding: 16, borderRadius: 14, marginBottom: 10, elevation: 1 },
  pName: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  pPrice: { fontSize: 22, fontWeight: "900", color: "#047857", marginVertical: 4 },
  pDesc: { fontSize: 12, color: "#64748B", marginBottom: 8 },
  feature: { fontSize: 12, color: "#334155", fontWeight: "600", marginTop: 2 },
});