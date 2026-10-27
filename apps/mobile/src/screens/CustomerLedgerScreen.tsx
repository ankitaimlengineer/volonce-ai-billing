import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getCustomerLedger,
  recordCustomerPayment,
  Customer,
  CustomerLedgerOut,
} from "../api";
import { colors } from "../theme";

interface Props {
  customer: Customer;
  onBack: () => void;
}

export default function CustomerLedgerScreen({ customer, onBack }: Props) {
  const [data, setData] = useState<CustomerLedgerOut | null>(null);
  const [loading, setLoading] = useState(true);

  // પેમેન્ટ સ્વીકારવા માટેનો મોડલ
  const [payModal, setPayModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "upi">("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadLedger();
  }, [customer.id]);

  const loadLedger = async () => {
    try {
      const res = await getCustomerLedger(customer.id);
      setData(res);
    } catch (err: any) {
      console.log("Ledger error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      Alert.alert("ભૂલ", "કૃપા કરીને માન્ય રકમ લખો.");
      return;
    }
    setSaving(true);
    try {
      await recordCustomerPayment(customer.id, amt, method, note);
      setPayModal(false);
      setAmount("");
      setNote("");
      loadLedger();
      Alert.alert("સફળતા! 🎉", `₹ ${amt} ની પેમેન્ટ જમા થઈ ગઈ છે.`);
    } catch (err: any) {
      Alert.alert("ભૂલ", err.message || "પેમેન્ટ નોંધવામાં સમસ્યા આવી.");
    } finally {
      setSaving(false);
    }
  };

  const outstandingVal = Number(data?.outstanding || customer.outstanding || 0);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.title}>{customer.name}</Text>
          <Text style={styles.subTitle}>
            📞 {customer.mobile ? `+91 ${customer.mobile}` : "મોબાઈલ નથી"}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setPayModal(true)} style={styles.payBtn}>
          <Text style={styles.payBtnText}>+ જમા કરો</Text>
        </TouchableOpacity>
      </View>

      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <View>
          <Text style={styles.balLabel}>કુલ લેવાના બાકી (Outstanding):</Text>
          <Text style={[styles.balAmount, outstandingVal > 0 ? styles.dueRed : styles.dueGreen]}>
            ₹ {outstandingVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </Text>
        </View>
        <Text style={styles.openingText}>
          શરૂઆતનું બેલેન્સ: ₹ {Number(data?.opening_balance || 0).toFixed(2)}
        </Text>
      </View>

      {/* Transactions List */}
      <Text style={styles.secTitle}>લેવડ-દેવડનો હિસાબ (Statement)</Text>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={[...(data?.items || [])].reverse()}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 14 }}
          renderItem={({ item }) => {
            const isDebit = Number(item.debit) > 0;
            return (
              <View style={styles.txCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txType}>
                    {item.entry_type === "sale"
                      ? "🛍️ વેચાણ બિલ (Sale)"
                      : item.entry_type === "payment"
                      ? "💵 જમા પેમેન્ટ (Payment)"
                      : item.entry_type === "sales_return"
                      ? "🔄 માલ પરત (Return)"
                      : "⚙️ એડજસ્ટમેન્ટ"}
                  </Text>
                  <Text style={styles.txDate}>
                    {new Date(item.created_at).toLocaleDateString("en-IN")}
                  </Text>
                  {item.note && <Text style={styles.txNote}>{item.note}</Text>}
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.txAmount, isDebit ? styles.dueRed : styles.dueGreen]}>
                    {isDebit ? `+ ₹ ${Number(item.debit).toFixed(2)}` : `- ₹ ${Number(item.credit).toFixed(2)}`}
                  </Text>
                  <Text style={styles.txBal}>બાકી: ₹ {Number(item.balance).toFixed(2)}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>હજુ કોઈ વ્યવહાર નોંધાયો નથી.</Text>
          }
        />
      )}

      {/* પેમેન્ટ મોડલ */}
      <Modal visible={payModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>💵 ગ્રાહક પાસેથી પેમેન્ટ લો</Text>
            <Text style={styles.modalSub}>ગ્રાહક: {customer.name}</Text>

            <Text style={styles.label}>રકમ (Amount ₹) *</Text>
            <TextInput
              placeholder="દા.ત. 500"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              style={styles.amountInput}
            />

            <Text style={styles.label}>ચુકવણી પદ્ધતિ (Method):</Text>
            <View style={{ flexDirection: "row", gap: 8, marginVertical: 6 }}>
              <TouchableOpacity
                onPress={() => setMethod("cash")}
                style={[styles.mBtn, method === "cash" && styles.mBtnActive]}
              >
                <Text style={[styles.mBtnText, method === "cash" && styles.mBtnTextActive]}>
                  💵 રોકડ (Cash)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMethod("upi")}
                style={[styles.mBtn, method === "upi" && styles.mBtnActive]}
              >
                <Text style={[styles.mBtnText, method === "upi" && styles.mBtnTextActive]}>
                  📱 UPI
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>નોંધ (Note - Optional)</Text>
            <TextInput
              placeholder="વિગત લખો..."
              value={note}
              onChangeText={setNote}
              style={styles.noteInput}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setPayModal(false)}
                style={styles.cancelBtn}
                disabled={saving}
              >
                <Text style={styles.cancelText}>રદ કરો</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePay}
                style={styles.saveBtn}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>જમા કરો ✓</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: { paddingVertical: 4 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  subTitle: { fontSize: 12, color: "#64748B" },
  payBtn: {
    backgroundColor: "#047857",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  payBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  balanceCard: {
    backgroundColor: "#FFFFFF",
    margin: 14,
    padding: 16,
    borderRadius: 14,
    elevation: 2,
  },
  balLabel: { fontSize: 12, color: "#64748B", fontWeight: "500" },
  balAmount: { fontSize: 24, fontWeight: "900", marginVertical: 4 },
  dueRed: { color: "#DC2626" },
  dueGreen: { color: "#047857" },
  openingText: { fontSize: 11, color: "#94A3B8" },
  secTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    marginLeft: 16,
    marginBottom: 4,
  },
  txCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    alignItems: "center",
  },
  txType: { fontSize: 14, fontWeight: "700", color: "#1E293B" },
  txDate: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  txNote: { fontSize: 11, color: "#64748B", marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: "800" },
  txBal: { fontSize: 11, color: "#64748B", marginTop: 2 },
  emptyText: { textAlign: "center", color: "#94A3B8", marginTop: 30, fontSize: 13 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    elevation: 5,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  modalSub: { fontSize: 13, color: "#64748B", marginBottom: 12 },
  label: { fontSize: 12, fontWeight: "600", color: "#475569", marginTop: 6, marginBottom: 4 },
  amountInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    padding: 10,
    fontSize: 18,
    fontWeight: "800",
    color: "#047857",
  },
  mBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#F1F5F9",
  },
  mBtnActive: { backgroundColor: "#D1FAE5", borderWidth: 1, borderColor: "#059669" },
  mBtnText: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  mBtnTextActive: { color: "#065F46", fontWeight: "700" },
  noteInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  cancelText: { color: "#64748B", fontWeight: "600" },
  saveBtn: {
    backgroundColor: "#047857",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  saveText: { color: "#fff", fontWeight: "700" },
});