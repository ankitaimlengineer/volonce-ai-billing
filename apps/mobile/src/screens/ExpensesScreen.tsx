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
import { getExpenses, createExpense, ExpenseItem } from "../api";
import { colors } from "../theme";

interface Props {
  onBack: () => void;
}

const CATEGORIES = [
  { key: "rent", label: "🏠 દુકાન ભાડું (Rent)" },
  { key: "electricity", label: "⚡ લાઈટ બિલ (Electricity)" },
  { key: "salary", label: "👥 પગાર (Salary)" },
  { key: "transport", label: "🚚 ટ્રાન્સપોર્ટ (Transport)" },
  { key: "internet", label: "📶 ઈન્ટરનેટ/ફોન (Internet)" },
  { key: "maintenance", label: "🔧 રિપેરિંગ (Maintenance)" },
  { key: "other", label: "☕ ચા-નાસ્તો / અન્ય (Other)" },
];

export default function ExpensesScreen({ onBack }: Props) {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [total, setTotal] = useState<number | string>(0);
  const [loading, setLoading] = useState(true);

  // નવો ખર્ચ મોડલ સ્ટેટ્સ
  const [modalVisible, setModalVisible] = useState(false);
  const [category, setCategory] = useState("other");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      const res = await getExpenses();
      setExpenses(res.items || []);
      setTotal(res.total_amount || 0);
    } catch (err: any) {
      console.log("Expense error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      Alert.alert("ભૂલ", "કૃપા કરીને માન્ય રકમ લખો.");
      return;
    }
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await createExpense({
        category,
        amount: amt,
        expense_date: today,
        payment_method: method,
        notes: note.trim() || undefined,
      });
      setModalVisible(false);
      setAmount("");
      setNote("");
      loadExpenses();
      Alert.alert("સફળતા! ✓", "ખર્ચ સફળતાપૂર્વક નોંધાઈ ગયો.");
    } catch (err: any) {
      Alert.alert("ભૂલ", err.message || "ખર્ચ નોંધવામાં સમસ્યા આવી.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા</Text>
        </TouchableOpacity>
        <Text style={styles.title}>દુકાનના ખર્ચા (Expenses)</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ નવો ખર્ચ</Text>
        </TouchableOpacity>
      </View>

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <Text style={styles.sumLabel}>કુલ સક્રિય ખર્ચ (Total Expenses):</Text>
        <Text style={styles.sumVal}>
          ₹ {Number(total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 14 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardCat}>{item.category.toUpperCase()}</Text>
                <Text style={styles.cardDate}>
                  📅 {item.expense_date} • {item.payment_method.toUpperCase()}
                </Text>
                {item.notes && <Text style={styles.cardNote}>{item.notes}</Text>}
              </View>
              <Text style={styles.cardAmt}>₹ {Number(item.amount).toFixed(2)}</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>હજુ કોઈ ખર્ચ નોંધાયો નથી.</Text>
          }
        />
      )}

      {/* મોડલ */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>📝 નવો ખર્ચ ઉમેરો</Text>

            <Text style={styles.label}>રકમ (Amount ₹) *</Text>
            <TextInput
              placeholder="0.00"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              style={styles.amountInput}
            />

            <Text style={styles.label}>કેટેગરી પસંદ કરો:</Text>
            <View style={styles.catGrid}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  style={[styles.catBtn, category === c.key && styles.catBtnActive]}
                >
                  <Text style={[styles.catText, category === c.key && styles.catTextActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>વિગત / નોંધ (Note)</Text>
            <TextInput
              placeholder="દા.ત. દુકાન માટે ચા-પાણી"
              value={note}
              onChangeText={setNote}
              style={styles.input}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.cancelBtn}
                disabled={saving}
              >
                <Text style={styles.cancelText}>રદ કરો</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleAddExpense}
                style={styles.saveBtn}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>સેવ કરો ✓</Text>
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
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: { paddingVertical: 4 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  addBtn: {
    backgroundColor: "#047857",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  summaryCard: {
    backgroundColor: "#FEF3C7",
    margin: 14,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  sumLabel: { fontSize: 12, color: "#92400E", fontWeight: "600" },
  sumVal: { fontSize: 24, fontWeight: "900", color: "#B45309", marginTop: 4 },
  card: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    alignItems: "center",
  },
  cardCat: { fontSize: 14, fontWeight: "800", color: "#1E293B" },
  cardDate: { fontSize: 11, color: "#64748B", marginTop: 2 },
  cardNote: { fontSize: 12, color: "#475569", marginTop: 2 },
  cardAmt: { fontSize: 16, fontWeight: "800", color: "#DC2626" },
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
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A", marginBottom: 10 },
  label: { fontSize: 12, fontWeight: "600", color: "#475569", marginTop: 8, marginBottom: 4 },
  amountInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    padding: 10,
    fontSize: 20,
    fontWeight: "800",
    color: "#B45309",
  },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 4 },
  catBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  catBtnActive: { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" },
  catText: { fontSize: 11, color: "#64748B" },
  catTextActive: { color: "#92400E", fontWeight: "700" },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 },
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