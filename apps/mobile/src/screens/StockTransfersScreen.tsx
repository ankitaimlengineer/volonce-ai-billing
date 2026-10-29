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
import { getStockTransfers, createStockTransfer, getShops, getProducts } from "../api";
import { colors } from "../theme";

export default function StockTransfersScreen({ navigation }: any) {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [modal, setModal] = useState(false);
  const [shops, setShops] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [fromShop, setFromShop] = useState("");
  const [toShop, setToShop] = useState("");
  const [product, setProduct] = useState("");
  const [qty, setQty] = useState("1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTransfers();
  }, []);

  const loadTransfers = async () => {
    try {
      const [tRes, sRes, pRes] = await Promise.all([
        getStockTransfers(),
        getShops(),
        getProducts(),
      ]);
      setTransfers(tRes || []);
      setShops(sRes || []);
      const pList = Array.isArray(pRes) ? pRes : (pRes as any).items || [];
      setProducts(pList);
      if (sRes && sRes.length >= 2) {
        setFromShop(sRes[0].id);
        setToShop(sRes[1].id);
      }
    } catch (e: any) {
      console.log("Transfers error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!fromShop || !toShop || fromShop === toShop) {
      return Alert.alert("ભૂલ", "સોર્સ અને ડેસ્ટિનેશન ગોડાઉન અલગ હોવા જોઈએ.");
    }
    if (!product) return Alert.alert("ભૂલ", "પ્રોડક્ટ પસંદ કરો.");
    const q = parseFloat(qty);
    if (!q || q <= 0) return Alert.alert("ભૂલ", "માન્ય જથ્થો લખો.");

    setSaving(true);
    try {
      await createStockTransfer({
        from_shop_id: fromShop,
        to_shop_id: toShop,
        transfer_date: new Date().toISOString().slice(0, 10),
        items: [{ product_id: product, quantity: q }],
      });
      Alert.alert("સફળતા! ✓", "માલ સફળતાપૂર્વક ટ્રાન્સફર થઈ ગયો!");
      setModal(false);
      loadTransfers();
    } catch (err: any) {
      Alert.alert("ભૂલ", err.message || "ટ્રાન્સફર નિષ્ફળ ગયું.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા</Text>
        </TouchableOpacity>
        <Text style={styles.title}>ગોડાઉન ટ્રાન્સફર (Stock Transfers)</Text>
        <TouchableOpacity onPress={() => setModal(true)} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ નવું</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={transfers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 14 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.trfNo}>{item.transfer_number}</Text>
              <Text style={styles.trfDate}>📅 {item.transfer_date}</Text>
              <Text style={styles.route}>🏢 {item.from_shop_name} ➔ 🏪 {item.to_shop_name}</Text>
              <Text style={styles.itemsCount}>{item.items?.length || 0} પ્રોડક્ટ્સ ટ્રાન્સફર થયેલ</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>કોઈ ટ્રાન્સફર રેકોર્ડ નથી.</Text>}
        />
      )}

      {/* Modal */}
      <Modal visible={modal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.mTitle}>🔄 નવો સ્ટોક ટ્રાન્સફર</Text>

            <Text style={styles.label}>કયા ગોડાઉનમાંથી માલ મોકલવો છે?</Text>
            <View style={styles.chipRow}>
              {shops.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chip, fromShop === s.id && styles.chipActive]}
                  onPress={() => setFromShop(s.id)}
                >
                  <Text style={[styles.chipText, fromShop === s.id && styles.chipTextActive]}>🏢 {s.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>કઈ શાખા/દુકાનમાં પહોંચાડવો છે?</Text>
            <View style={styles.chipRow}>
              {shops.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chip, toShop === s.id && styles.chipActive]}
                  onPress={() => setToShop(s.id)}
                >
                  <Text style={[styles.chipText, toShop === s.id && styles.chipTextActive]}>🏪 {s.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>પ્રોડક્ટ પસંદ કરો:</Text>
            <View style={styles.chipRow}>
              {products.slice(0, 8).map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, product === p.id && styles.chipActive]}
                  onPress={() => setProduct(p.id)}
                >
                  <Text style={[styles.chipText, product === p.id && styles.chipTextActive]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>જથ્થો (Quantity):</Text>
            <TextInput style={styles.input} value={qty} onChangeText={setQty} keyboardType="numeric" />

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <TouchableOpacity onPress={() => setModal(false)} style={{ padding: 10 }}><Text style={{ color: "#64748B", fontWeight: "700" }}>રદ કરો</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleTransfer} style={styles.saveBtn} disabled={saving}>
                <Text style={{ color: "#fff", fontWeight: "800" }}>{saving ? "થાય છે..." : "ટ્રાન્સફર કરો ✓"}</Text>
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  backBtn: { paddingVertical: 4 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  title: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  addBtn: { backgroundColor: "#047857", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  card: { backgroundColor: "#fff", padding: 14, borderRadius: 12, marginBottom: 8, elevation: 1 },
  trfNo: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  trfDate: { fontSize: 11, color: "#64748B", marginTop: 2 },
  route: { fontSize: 13, fontWeight: "700", color: "#047857", marginTop: 4 },
  itemsCount: { fontSize: 11, color: "#334155", marginTop: 2 },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 40, fontSize: 13 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 360, backgroundColor: "#fff", borderRadius: 16, padding: 18 },
  mTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A", marginBottom: 10 },
  label: { fontSize: 12, fontWeight: "700", color: "#475569", marginTop: 8, marginBottom: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6, backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#CBD5E1" },
  chipActive: { backgroundColor: "#D1FAE5", borderColor: "#059669" },
  chipText: { fontSize: 11, color: "#475569" },
  chipTextActive: { color: "#065F46", fontWeight: "800" },
  input: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, padding: 8, fontSize: 14, fontWeight: "800" },
  saveBtn: { backgroundColor: "#047857", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
});