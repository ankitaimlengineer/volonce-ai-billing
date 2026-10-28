import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createInvoice, Customer, Product } from "../api";
import {
  getLocalCachedProducts,
  getLocalCachedCustomers,
  syncCatalogToLocalDb,
  saveInvoiceOffline,
} from "../db";
import BarcodeScannerModal from "../components/BarcodeScannerModal";
import { colors } from "../theme";

interface BillingScreenProps {
  onBack: () => void;
}

export default function BillingScreen({ onBack }: BillingScreenProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<{ [id: string]: number }>({});
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi">("cash");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    loadCatalogData();
  }, []);

  const loadCatalogData = async () => {
    setLoading(true);
    // ૧. પ્રથમ લોકલ SQLite માંથી ત્વરિત લોડ કરો (૦ મિલીસેકન્ડમાં)
    try {
      const localProds = await getLocalCachedProducts();
      const localCusts = await getLocalCachedCustomers();
      if (localProds.length > 0) {
        setProducts(localProds);
      }
      if (localCusts.length > 0) {
        setCustomers(localCusts);
      }
    } catch (e) {
      console.log("Local SQLite read note:", e);
    } finally {
      setLoading(false);
    }

    // ૨. બેકગ્રાઉન્ડમાં સર્વર સાથે સિંક કરો (જો નેટ હોય તો)
    syncCatalogToLocalDb()
      .then((res) => {
        if (res.productsCount > 0) {
          setIsOnline(true);
          getLocalCachedProducts().then(setProducts);
          getLocalCachedCustomers().then(setCustomers);
        }
      })
      .catch(() => {
        setIsOnline(false); // ઑફલાઇન મોડ
      });
  };

  // બારકોડથી સ્કેન થયેલી પ્રોડક્ટ સીધી કાર્ટમાં ઉમેરો
  const handleProductFoundViaBarcode = (product: Product) => {
    addToCart(product.id);
    Alert.alert("✓ પ્રોડક્ટ ઉમેરાઈ!", `${product.name} (ભાવ: ₹${Number(product.selling_price).toFixed(2)})`);
  };

  const addToCart = (id: string) => {
    setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => {
      const qty = prev[id] || 0;
      if (qty <= 1) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: qty - 1 };
    });
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let taxTotal = 0;

    Object.keys(cart).forEach((id) => {
      const p = products.find((x) => x.id === id);
      if (p) {
        const qty = cart[id];
        const rate = Number(p.selling_price) || 0;
        const taxRate = Number(p.tax_percent) || 0;

        const base = rate * qty;
        const tax = Math.round(((base * taxRate) / 100) * 100) / 100;

        subtotal += base;
        taxTotal += tax;
      }
    });

    const grandTotal = Math.round((subtotal + taxTotal) * 100) / 100;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      grandTotal,
    };
  };

  const totals = calculateTotals();

  // બિલ કન્ફર્મ કરો (Online -> Fallback to SQLite Offline Queue)
  const handleCreateBill = async () => {
    if (Object.keys(cart).length === 0) {
      Alert.alert("ભૂલ", "કૃપા કરીને પહેલા કાર્ટમાં પ્રોડક્ટ ઉમેરો");
      return;
    }

    setSubmitting(true);
    const items = Object.keys(cart).map((id) => ({
      product_id: id,
      quantity: cart[id],
      discount_percent: 0,
    }));

    const payments = [
      {
        method: paymentMethod,
        amount: totals.grandTotal,
      },
    ];

    const payload = {
      customer_id: selectedCustomer ? selectedCustomer.id : null,
      items,
      payments,
    };

    try {
      // ૧. સર્વર પર ઓનલાઇન મોકલવાનો પ્રયાસ કરો
      const invoiceRes = await createInvoice(payload);
      const invNumber = invoiceRes?.invoice_number || `INV-${Date.now().toString().slice(-6)}`;
      const invDate = invoiceRes?.invoice_date || new Date().toISOString().slice(0, 10);
      const subtotalVal = Number(invoiceRes?.subtotal || totals.subtotal).toFixed(2);
      const taxTotalVal = Number(invoiceRes?.tax_total || totals.taxTotal).toFixed(2);
      const grandTotalVal = Number(invoiceRes?.grand_total || totals.grandTotal).toFixed(2);

      // આઇટમ્સ લિસ્ટ
      const itemsList = Object.keys(cart)
        .map((id) => {
          const p = products.find((x) => x.id === id);
          const qty = cart[id];
          const rate = Number(p?.selling_price) || 0;
          return `• *${p?.name}* (જથ્થો: ${qty}) = ₹${(rate * qty).toFixed(2)}`;
        })
        .join("\n");

      // WhatsApp મેસેજ
      const professionalMsg = 
`🧾 *ટેક્સ ઇન્વોઇસ - VOLONCE AI STORE*
━━━━━━━━━━━━━━━━━━━━
👤 *ગ્રાહક:* ${selectedCustomer ? selectedCustomer.name : "Walk-in Customer"}
📄 *બિલ નં:* ${invNumber}
📅 *તારીખ:* ${invDate}

🛍️ *ખરીદેલી વસ્તુઓની વિગત:*
${itemsList}
━━━━━━━━━━━━━━━━━━━━
💵 *સબટોટલ:* ₹${subtotalVal}
📊 *GST ટેક્સ:* ₹${taxTotalVal}
💰 *કુલ રકમ:* *₹${grandTotalVal}*
✅ *પેમેન્ટ સ્ટેટસ:* ચૂકતે (${paymentMethod.toUpperCase()})

🙏 *મુલાકાત બદલ ખૂબ ખૂબ આભાર! ફરી પધારશો.*`;

      Alert.alert(
        "બિલ સફળતાપૂર્વક બન્યું! 🎉",
        `બિલ નં: ${invNumber}\nકુલ રકમ: ₹${grandTotalVal}`,
        [
          {
            text: "WhatsApp પર મોકલો 💬",
            onPress: () => {
              const phone = selectedCustomer?.mobile || selectedCustomer?.phone || "";
              const cleanPhone = phone.replace(/[^0-9]/g, "");
              const formattedPhone = cleanPhone.length === 10 ? "91" + cleanPhone : cleanPhone;
              const url = formattedPhone
                ? `whatsapp://send?phone=${formattedPhone}&text=${encodeURIComponent(professionalMsg)}`
                : `whatsapp://send?text=${encodeURIComponent(professionalMsg)}`;

              Linking.openURL(url).catch(() => {
                Alert.alert("WhatsApp", "WhatsApp ખૂલી શક્યું નથી.");
              });
              onBack();
            },
          },
          { text: "ડન (Done)", onPress: onBack },
        ]
      );
    } catch (err: any) {
      // ૨. જો નેટ ન હોય તો સુરક્ષિત રીતે SQLite માં ઑફલાઇન સેવ કરો
      const customerName = selectedCustomer ? selectedCustomer.name : "Walk-in Customer";
      const customerMobile = selectedCustomer?.mobile || selectedCustomer?.phone;

      await saveInvoiceOffline(payload, customerName, customerMobile, totals.grandTotal);

      Alert.alert(
        "📶 ઑફલાઇન સેવ થઈ ગયું! (Saved Offline)",
        `ઇન્ટરનેટ ન હોવાથી આ બિલ ફોનની મેમરી (SQLite) માં સુરક્ષિત સેવ કરવામાં આવ્યું છે.\nજ્યારે નેટ ચાલુ થશે ત્યારે 'Offline Drafts' માંથી ૧-ક્લિકમાં સર્વર સાથે સિંક થઈ જશે.`,
        [{ text: "સમજાયું (OK)", onPress: onBack }]
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())) ||
      (p.barcode && p.barcode.includes(search))
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.title}>નવું બિલ (POS Billing)</Text>
          <Text style={[styles.networkBadge, isOnline ? styles.netOnline : styles.netOffline]}>
            {isOnline ? "🟢 ઓનલાઇન" : "📶 ઑફલાઇન (SQLite Active)"}
          </Text>
        </View>

        {/* 📷 Barcode Scanner Button */}
        <TouchableOpacity style={styles.scannerBtn} onPress={() => setIsScannerOpen(true)}>
          <Text style={styles.scannerBtnText}>📷 સ્કેન કરો</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchBar}>
        <TextInput
          placeholder="પ્રોડક્ટનું નામ, SKU કે બારકોડ શોધો..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            data={filteredProducts}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item }) => {
              const qty = cart[item.id] || 0;
              const tax = Number(item.tax_percent) || 0;
              return (
                <View style={styles.card}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prodName}>{item.name}</Text>
                    {item.barcode ? <Text style={styles.barcodeLabel}>|||| {item.barcode}</Text> : null}
                    <Text style={styles.prodPrice}>
                      ₹{Number(item.selling_price).toFixed(2)} {tax > 0 ? `(+${tax}% GST)` : ""}
                    </Text>
                  </View>
                  <View style={styles.qtyRow}>
                    {qty > 0 && (
                      <TouchableOpacity onPress={() => removeFromCart(item.id)} style={styles.qtyBtn}>
                        <Text style={styles.qtyBtnText}>-</Text>
                      </TouchableOpacity>
                    )}
                    {qty > 0 && <Text style={styles.qtyText}>{qty}</Text>}
                    <TouchableOpacity onPress={() => addToCart(item.id)} style={styles.addBtn}>
                      <Text style={styles.addBtnText}>{qty > 0 ? "+" : "ઉમેરો +"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />

          {/* Payment Method Selector */}
          <View style={styles.paymentSelector}>
            <Text style={styles.payLabel}>ચુકવણી પદ્ધતિ (Payment Mode):</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setPaymentMethod("cash")}
                style={[styles.payOption, paymentMethod === "cash" && styles.payOptionActive]}
              >
                <Text style={[styles.payText, paymentMethod === "cash" && styles.payTextActive]}>
                  💵 રોકડ (Cash)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPaymentMethod("upi")}
                style={[styles.payOption, paymentMethod === "upi" && styles.payOptionActive]}
              >
                <Text style={[styles.payText, paymentMethod === "upi" && styles.payTextActive]}>
                  📱 UPI
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Bottom Total & Checkout Bar */}
          <View style={styles.bottomBar}>
            <View>
              <Text style={styles.totalLabel}>
                કુલ રકમ (GST: ₹{totals.taxTotal.toFixed(2)})
              </Text>
              <Text style={styles.totalVal}>₹{totals.grandTotal.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.checkoutBtn, submitting && { opacity: 0.7 }]}
              onPress={handleCreateBill}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.checkoutText}>બિલ કન્ફર્મ કરો ✓</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Live Barcode Camera Modal */}
      <BarcodeScannerModal
        visible={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onProductFound={handleProductFoundViaBarcode}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: { paddingVertical: 4 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  title: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  networkBadge: { fontSize: 10, fontWeight: "700", marginTop: 1 },
  netOnline: { color: "#047857" },
  netOffline: { color: "#D97706" },
  scannerBtn: {
    backgroundColor: "#0F172A",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  scannerBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  searchBar: { padding: 12, backgroundColor: "#FFFFFF" },
  searchInput: {
    backgroundColor: "#F1F5F9",
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    alignItems: "center",
  },
  prodName: { fontSize: 15, fontWeight: "700", color: "#1E293B" },
  barcodeLabel: { fontSize: 10, color: "#64748B", fontFamily: "monospace", marginTop: 2 },
  prodPrice: { fontSize: 14, color: "#047857", fontWeight: "700", marginTop: 3 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  qtyBtn: {
    backgroundColor: "#E2E8F0",
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: { fontSize: 16, fontWeight: "700" },
  qtyText: { fontSize: 15, fontWeight: "800", marginHorizontal: 4 },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  paymentSelector: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  payLabel: { fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 },
  payOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#F1F5F9",
  },
  payOptionActive: { backgroundColor: "#D1FAE5", borderWidth: 1, borderColor: "#059669" },
  payText: { fontSize: 12, fontWeight: "600", color: "#475569" },
  payTextActive: { color: "#065F46", fontWeight: "700" },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  totalLabel: { fontSize: 11, color: "#64748B" },
  totalVal: { fontSize: 20, fontWeight: "900", color: "#0F172A" },
  checkoutBtn: {
    backgroundColor: "#047857",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
  },
  checkoutText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
});