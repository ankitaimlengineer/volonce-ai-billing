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
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getInvoices, downloadInvoicePdf, savePdfToPhone, printInvoicePdf } from "../api";
import { colors } from "../theme";

export default function InvoicesScreen({ navigation }: any) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      const res = await getInvoices();
      setInvoices(res || []);
    } catch (e: any) {
      console.log("Invoice error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (inv: any) => {
    setActionBusy(true);
    try {
      const uri = await downloadInvoicePdf(inv.id, inv.invoice_number);
      const saved = await savePdfToPhone(uri, inv.invoice_number);
      if (saved) Alert.alert("સફળતા! 📥", `બિલ ${inv.invoice_number} ફોનમાં સેવ થઈ ગયું!`);
    } catch (err: any) {
      Alert.alert("ભૂલ", err.message || "PDF સેવ થઈ શકી નથી.");
    } finally {
      setActionBusy(false);
    }
  };

  const handlePrint = async (inv: any) => {
    setActionBusy(true);
    try {
      const uri = await downloadInvoicePdf(inv.id, inv.invoice_number);
      await printInvoicePdf(uri);
    } catch (err: any) {
      Alert.alert("પ્રિન્ટ ભૂલ", err.message || "પ્રિન્ટ થઈ શક્યું નહીં.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleWhatsApp = (inv: any) => {
    const msg = `🧾 *ઇન્વોઇસ: ${inv.invoice_number}*\n📅 તારીખ: ${inv.invoice_date}\n💰 કુલ રકમ: ₹${Number(inv.grand_total).toFixed(2)}\n✅ પેમેન્ટ: ${Number(inv.paid_amount) >= Number(inv.grand_total) ? "ચૂકતે (PAID)" : "બાકી"}`;
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`).catch(() => Alert.alert("WhatsApp ખૂલ્યું નથી"));
  };

  const filtered = invoices.filter((i) =>
    i.invoice_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા</Text>
        </TouchableOpacity>
        <Text style={styles.title}>બિલોનો ઇતિહાસ (Invoices History)</Text>
      </View>

      <View style={styles.searchBox}>
        <TextInput
          placeholder="બિલ નંબરથી શોધો (દા.ત. INV00001)..."
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
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 14 }}
          renderItem={({ item }) => {
            const due = Number(item.grand_total) - Number(item.paid_amount);
            return (
              <View style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invNumber}>{item.invoice_number}</Text>
                  <Text style={styles.invDate}>📅 {item.invoice_date}</Text>
                  <Text style={styles.invTotal}>કુલ: ₹{Number(item.grand_total).toFixed(2)}</Text>
                  <Text style={[styles.invStatus, due <= 0 ? styles.paid : styles.due]}>
                    {due <= 0 ? "✓ ચૂકતે (Paid)" : `બાકી: ₹${due.toFixed(2)}`}
                  </Text>
                </View>

                <View style={styles.actionCol}>
                  <TouchableOpacity
                    style={styles.btnPdf}
                    onPress={() => handleDownload(item)}
                    disabled={actionBusy}
                  >
                    <Text style={styles.btnText}>📥 PDF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnWa}
                    onPress={() => handleWhatsApp(item)}
                  >
                    <Text style={styles.btnText}>💬 શેર</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnPrint}
                    onPress={() => handlePrint(item)}
                    disabled={actionBusy}
                  >
                    <Text style={styles.btnText}>🖨️ પ્રિન્ટ</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>કોઈ બિલ મળ્યું નથી.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  backBtn: { marginRight: 12 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  searchBox: { padding: 12, backgroundColor: "#FFFFFF" },
  searchInput: { backgroundColor: "#F1F5F9", padding: 10, borderRadius: 10, fontSize: 13 },
  card: { flexDirection: "row", backgroundColor: "#FFFFFF", padding: 14, borderRadius: 14, marginBottom: 10, elevation: 1 },
  invNumber: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  invDate: { fontSize: 11, color: "#64748B", marginTop: 2 },
  invTotal: { fontSize: 15, fontWeight: "900", color: "#047857", marginTop: 4 },
  invStatus: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  paid: { color: "#16A34A" },
  due: { color: "#DC2626" },
  actionCol: { justifyContent: "space-between", gap: 5 },
  btnPdf: { backgroundColor: "#0284C7", paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, alignItems: "center" },
  btnWa: { backgroundColor: "#16A34A", paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, alignItems: "center" },
  btnPrint: { backgroundColor: "#0F172A", paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 40, fontSize: 13 },
});