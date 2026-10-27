import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCustomers, createCustomer, Customer } from "../api";
import { colors } from "../theme";

interface Props {
  onBack: () => void;
  onSelectCustomer: (customer: Customer) => void;
}

export default function CustomersScreen({ onBack, onSelectCustomer }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // નવો કસ્ટમર મોડલ સ્ટેટ
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [newBalance, setNewBalance] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const res = await getCustomers();
      const list = Array.isArray(res) ? res : res.items || [];
      setCustomers(list);
    } catch (err: any) {
      console.log("Customer fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomer = async () => {
    if (!newName.trim()) {
      Alert.alert("ભૂલ", "કૃપા કરીને ગ્રાહકનું નામ લખો.");
      return;
    }
    setSaving(true);
    try {
      await createCustomer({
        name: newName.trim(),
        mobile: newMobile.trim() || undefined,
        customer_type: "retail",
        opening_balance: newBalance.trim() || "0",
      });
      setModalVisible(false);
      setNewName("");
      setNewMobile("");
      setNewBalance("");
      loadCustomers();
      Alert.alert("સફળતા", "નવો ગ્રાહક સફળતાપૂર્વક ઉમેરાઈ ગયો!");
    } catch (err: any) {
      Alert.alert("ભૂલ", err.message || "ગ્રાહક ઉમેરવામાં સમસ્યા આવી.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.mobile && c.mobile.includes(search))
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા જાઓ</Text>
        </TouchableOpacity>
        <Text style={styles.title}>ગ્રાહકો અને ઉધારી (Khata)</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ નવો</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <TextInput
          placeholder="ગ્રાહકનું નામ અથવા મોબાઈલથી શોધો..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 14 }}
          renderItem={({ item }) => {
            const due = Number(item.outstanding ?? item.current_balance ?? 0);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => onSelectCustomer(item)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.custName}>{item.name}</Text>
                  <Text style={styles.custPhone}>
                    📞 {item.mobile ? `+91 ${item.mobile}` : "મોબાઈલ નંબર નથી"}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.dueLabel}>બાકી ઉધારી:</Text>
                  <Text style={[styles.dueAmount, due > 0 ? styles.dueRed : styles.dueGreen]}>
                    ₹ {due.toLocaleString("en-IN")}
                  </Text>
                  <Text style={styles.viewLedgerText}>ખાતાવહી જુઓ →</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>કોઈ ગ્રાહક મળ્યા નથી.</Text>
          }
        />
      )}

      {/* નવો કસ્ટમર મોડલ */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>👤 નવો ગ્રાહક ઉમેરો</Text>

            <Text style={styles.label}>ગ્રાહકનું નામ *</Text>
            <TextInput
              placeholder="દા.ત. રમેશભાઈ પટેલ"
              value={newName}
              onChangeText={setNewName}
              style={styles.input}
            />

            <Text style={styles.label}>મોબાઈલ નંબર</Text>
            <TextInput
              placeholder="10 અંકનો મોબાઈલ"
              value={newMobile}
              onChangeText={setNewMobile}
              keyboardType="phone-pad"
              style={styles.input}
            />

            <Text style={styles.label}>જૂની બાકી ઉધારી (જો હોય તો)</Text>
            <TextInput
              placeholder="₹ 0.00"
              value={newBalance}
              onChangeText={setNewBalance}
              keyboardType="numeric"
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
                onPress={handleAddCustomer}
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
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  searchBox: { padding: 12, backgroundColor: "#FFFFFF" },
  searchInput: {
    backgroundColor: "#F1F5F9",
    padding: 10,
    borderRadius: 10,
    fontSize: 14,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 1,
  },
  custName: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  custPhone: { fontSize: 12, color: "#64748B", marginTop: 4 },
  dueLabel: { fontSize: 11, color: "#64748B" },
  dueAmount: { fontSize: 16, fontWeight: "800", marginVertical: 2 },
  dueRed: { color: "#DC2626" },
  dueGreen: { color: "#047857" },
  viewLedgerText: { fontSize: 11, color: colors.primary, fontWeight: "600" },
  emptyText: { textAlign: "center", color: "#94A3B8", marginTop: 40, fontSize: 14 },

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
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A", marginBottom: 14 },
  label: { fontSize: 12, fontWeight: "600", color: "#475569", marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    padding: 9,
    fontSize: 14,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  cancelText: { color: "#64748B", fontWeight: "600" },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  saveText: { color: "#fff", fontWeight: "700" },
});