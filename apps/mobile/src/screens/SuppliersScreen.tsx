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
import { getSuppliers, createSupplier, recordSupplierPayment, Supplier } from "../api";
import { colors } from "../theme";

interface Props {
  navigation: any;
}

export default function SuppliersScreen({ navigation }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [gst, setGst] = useState("");
  const [opening, setOpening] = useState("");
  const [saving, setSaving] = useState(false);

  // પેમેન્ટ મોડલ
  const [payModal, setPayModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "upi">("cash");

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    try {
      const res = await getSuppliers();
      const list = Array.isArray(res) ? res : (res as any).items || [];
      setSuppliers(list);
    } catch (err: any) {
      console.log("Suppliers error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!name.trim()) {
      Alert.alert("ભૂલ", "વેપારીનું નામ લખો.");
      return;
    }
    setSaving(true);
    try {
      await createSupplier({
        name: name.trim(),
        mobile: mobile.trim() || undefined,
        gst_number: gst.trim() || undefined,
        opening_balance: opening.trim() || "0",
      });
      setModalVisible(false);
      setName("");
      setMobile("");
      setGst("");
      setOpening("");
      loadSuppliers();
      Alert.alert("સફળતા ✓", "નવો સપ્લાયર ઉમેરાઈ ગયો.");
    } catch (err: any) {
      Alert.alert("ભૂલ", err.message || "સપ્લાયર ઉમેરવામાં સમસ્યા આવી.");
    } finally {
      setSaving(false);
    }
  };

  const handlePaySupplier = async () => {
    const amt = parseFloat(payAmount);
    if (!selectedSupplier || !amt || amt <= 0) {
      Alert.alert("ભૂલ", "માન્ય રકમ લખો.");
      return;
    }
    setSaving(true);
    try {
      await recordSupplierPayment(selectedSupplier.id, amt, payMethod);
      setPayModal(false);
      setPayAmount("");
      loadSuppliers();
      Alert.alert("સફળતા! 💵", `વેપારીને ₹${amt} ચૂકતે નોંધાઈ ગયા.`);
    } catch (err: any) {
      Alert.alert("ભૂલ", err.message || "ચુકવણી નોંધવામાં ભૂલ આવી.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.mobile && s.mobile.includes(search))
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા</Text>
        </TouchableOpacity>
        <Text style={styles.title}>વેપારીઓ (Suppliers)</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ નવો</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <TextInput
          placeholder="વેપારીના નામ કે મોબાઈલથી શોધો..."
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
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: 14 }}
          renderItem={({ item }) => {
            const due = Number(item.outstanding || 0);
            return (
              <View style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.sub}>
                    📞 {item.mobile ? `+91 ${item.mobile}` : "મોબાઈલ નથી"}
                  </Text>
                  {item.gst_number && (
                    <Text style={styles.gstBadge}>GST: {item.gst_number}</Text>
                  )}
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.dueLabel}>આપવાના બાકી:</Text>
                  <Text style={[styles.dueAmount, due > 0 ? styles.dueRed : styles.dueGreen]}>
                    ₹ {due.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </Text>
                  <TouchableOpacity
                    style={styles.payBtn}
                    onPress={() => {
                      setSelectedSupplier(item);
                      setPayModal(true);
                    }}
                  >
                    <Text style={styles.payBtnText}>ચૂકવો (Pay)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>કોઈ વેપારી મળ્યા નથી.</Text>
          }
        />
      )}

      {/* નવો વેપારી મોડલ */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🏢 નવો વેપારી ઉમેરો</Text>

            <Text style={styles.label}>વેપારી/પેઢીનું નામ *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="દા.ત. શ્રીજી ટ્રેડર્સ" />

            <Text style={styles.label}>મોબાઈલ નંબર</Text>
            <TextInput style={styles.input} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />

            <Text style={styles.label}>GSTIN (જો હોય તો)</Text>
            <TextInput style={styles.input} value={gst} onChangeText={setGst} autoCapitalize="characters" />

            <Text style={styles.label}>શરૂઆતનું બાકી દેવું (Opening Payable ₹)</Text>
            <TextInput style={styles.input} value={opening} onChangeText={setOpening} keyboardType="numeric" placeholder="0.00" />

            <View style={styles.actions}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>રદ કરો</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAdd} style={styles.saveBtn} disabled={saving}>
                <Text style={styles.saveText}>{saving ? "સેવ થાય છે..." : "સેવ કરો ✓"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* પેમેન્ટ ચૂકવણી મોડલ */}
      <Modal visible={payModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>💵 વેપારીને ચુકવણી કરો</Text>
            <Text style={styles.sub}>વેપારી: {selectedSupplier?.name}</Text>

            <Text style={styles.label}>ચૂકવેલી રકમ (₹) *</Text>
            <TextInput
              style={[styles.input, { fontSize: 18, fontWeight: "800", color: "#DC2626" }]}
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="numeric"
              placeholder="0.00"
            />

            <Text style={styles.label}>પદ્ધતિ:</Text>
            <View style={{ flexDirection: "row", gap: 10, marginVertical: 6 }}>
              <TouchableOpacity
                onPress={() => setPayMethod("cash")}
                style={[styles.mBtn, payMethod === "cash" && styles.mBtnActive]}
              >
                <Text style={payMethod === "cash" ? styles.mTextActive : styles.mText}>રોકડ (Cash)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPayMethod("upi")}
                style={[styles.mBtn, payMethod === "upi" && styles.mBtnActive]}
              >
                <Text style={payMethod === "upi" ? styles.mTextActive : styles.mText}>UPI</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity onPress={() => setPayModal(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>રદ કરો</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePaySupplier} style={styles.saveBtn} disabled={saving}>
                <Text style={styles.saveText}>{saving ? "ચુકવાય છે..." : "ચૂકવો ✓"}</Text>
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
  addBtn: { backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  searchBox: { padding: 12, backgroundColor: "#FFFFFF" },
  searchInput: { backgroundColor: "#F1F5F9", padding: 10, borderRadius: 10, fontSize: 14 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 1,
  },
  name: { fontSize: 15, fontWeight: "700", color: "#1E293B" },
  sub: { fontSize: 12, color: "#64748B", marginTop: 2 },
  gstBadge: { fontSize: 10, color: "#047857", fontWeight: "700", marginTop: 4 },
  dueLabel: { fontSize: 11, color: "#64748B" },
  dueAmount: { fontSize: 16, fontWeight: "800", marginVertical: 2 },
  dueRed: { color: "#DC2626" },
  dueGreen: { color: "#047857" },
  payBtn: { backgroundColor: "#0F172A", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, marginTop: 4 },
  payBtnText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  emptyText: { textAlign: "center", color: "#94A3B8", marginTop: 40, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 360, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A", marginBottom: 6 },
  label: { fontSize: 12, fontWeight: "600", color: "#475569", marginTop: 8, marginBottom: 4 },
  input: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, padding: 9, fontSize: 14 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 14 },
  cancelText: { color: "#64748B", fontWeight: "600" },
  saveBtn: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  saveText: { color: "#fff", fontWeight: "700" },
  mBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: "#F1F5F9" },
  mBtnActive: { backgroundColor: "#FEE2E2", borderWidth: 1, borderColor: "#DC2626" },
  mText: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  mTextActive: { color: "#991B1B", fontWeight: "700" },
});