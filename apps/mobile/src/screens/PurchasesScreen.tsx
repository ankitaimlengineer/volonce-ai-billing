import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSuppliers, getProducts, createPurchase, Supplier, Product } from "../api";
import { colors } from "../theme";

interface Props {
  navigation: any;
}

export default function PurchasesScreen({ navigation }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState("");
  const [paidAmount, setPaidAmount] = useState("");

  useEffect(() => {
    Promise.all([getSuppliers(), getProducts()])
      .then(([sRes, pRes]) => {
        setSuppliers(Array.isArray(sRes) ? sRes : (sRes as any).items || []);
        setProducts(Array.isArray(pRes) ? pRes : (pRes as any).items || []);
      })
      .catch((e) => console.log("Load error:", e))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectProduct = (pId: string) => {
    setSelectedProductId(pId);
    const found = products.find((p) => p.id === pId);
    if (found) {
      setRate(String(found.purchase_price || 0));
    }
  };

  const handleSavePurchase = async () => {
    if (!selectedSupplierId) {
      Alert.alert("ભૂલ", "વેપારી (સપ્લાયર) પસંદ કરો.");
      return;
    }
    if (!invoiceNumber.trim()) {
      Alert.alert("ભૂલ", "વેપારીનું બિલ નંબર (Invoice No) લખો.");
      return;
    }
    if (!selectedProductId) {
      Alert.alert("ભૂલ", "ખરીદેલી પ્રોડક્ટ પસંદ કરો.");
      return;
    }

    const q = parseFloat(qty) || 1;
    const r = parseFloat(rate) || 0;
    const paid = parseFloat(paidAmount) || 0;

    setSubmitting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await createPurchase({
        supplier_id: selectedSupplierId,
        invoice_number: invoiceNumber.trim(),
        purchase_date: today,
        items: [
          {
            product_id: selectedProductId,
            quantity: q,
            rate: r,
            tax_percent: 0,
          },
        ],
        paid_amount: paid,
        payment_method: paid > 0 ? "cash" : undefined,
      });

      Alert.alert("સફળતા! 🎉", "ખરીદી સફળતાપૂર્વક નોંધાઈ ગઈ છે અને સ્ટોક વધી ગયો છે!");
      navigation.goBack();
    } catch (err: any) {
      Alert.alert("ભૂલ", err.message || "ખરીદી નોંધવામાં સમસ્યા આવી.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const calculatedTotal = (parseFloat(qty) || 0) * (parseFloat(rate) || 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા</Text>
        </TouchableOpacity>
        <Text style={styles.title}>માલની ખરીદી (Purchase)</Text>
      </View>

      <FlatList
        data={[1]}
        keyExtractor={() => "form"}
        contentContainerStyle={{ padding: 16 }}
        renderItem={() => (
          <View style={styles.formCard}>
            <Text style={styles.label}>૧. વેપારી (Supplier) પસંદ કરો *</Text>
            <View style={styles.pickerBox}>
              {suppliers.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setSelectedSupplierId(s.id)}
                  style={[styles.chip, selectedSupplierId === s.id && styles.chipActive]}
                >
                  <Text style={selectedSupplierId === s.id ? styles.chipTextActive : styles.chipText}>
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>૨. બિલ નંબર (Invoice Number) *</Text>
            <TextInput
              style={styles.input}
              placeholder="દા.ત. PUR-2026-001"
              value={invoiceNumber}
              onChangeText={setInvoiceNumber}
            />

            <Text style={styles.label}>૩. પ્રોડક્ટ પસંદ કરો *</Text>
            <View style={styles.pickerBox}>
              {products.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => handleSelectProduct(p.id)}
                  style={[styles.chip, selectedProductId === p.id && styles.chipActive]}
                >
                  <Text style={selectedProductId === p.id ? styles.chipTextActive : styles.chipText}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>જથ્થો (Qty)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={qty}
                  onChangeText={setQty}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>ખરીદ ભાવ (Rate ₹)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={rate}
                  onChangeText={setRate}
                />
              </View>
            </View>

            <View style={styles.totalBox}>
              <Text style={{ fontSize: 13, color: "#64748B" }}>ખરીદીની કુલ રકમ:</Text>
              <Text style={{ fontSize: 22, fontWeight: "900", color: "#0F172A" }}>
                ₹ {calculatedTotal.toFixed(2)}
              </Text>
            </View>

            <Text style={styles.label}>રોકડા ચૂકવેલ રકમ (Paid Amount ₹)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              keyboardType="numeric"
              value={paidAmount}
              onChangeText={setPaidAmount}
            />

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSavePurchase}
              disabled={submitting}
            >
              <Text style={styles.submitText}>
                {submitting ? "સેવ થાય છે..." : "ખરીદી કન્ફર્મ કરો ✓"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />
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
  backBtn: { marginRight: 12 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  formCard: { backgroundColor: "#FFFFFF", padding: 18, borderRadius: 14, elevation: 1 },
  label: { fontSize: 13, fontWeight: "700", color: "#334155", marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
  },
  pickerBox: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipActive: { backgroundColor: "#D1FAE5", borderColor: "#059669" },
  chipText: { fontSize: 12, color: "#475569", fontWeight: "600" },
  chipTextActive: { fontSize: 12, color: "#065F46", fontWeight: "700" },
  totalBox: {
    marginVertical: 14,
    padding: 12,
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
    alignItems: "center",
  },
  submitBtn: {
    backgroundColor: "#047857",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 18,
  },
  submitText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});