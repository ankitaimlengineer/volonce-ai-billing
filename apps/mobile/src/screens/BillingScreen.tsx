import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getProducts, getCustomers, createInvoice, Customer } from "../api";
import { colors } from "../theme";

interface ProductItem {
  id: string;
  name: string;
  sku?: string;
  selling_price: number | string;
  tax_percent?: number | string;
}

interface BillingScreenProps {
  onBack: () => void;
}

export default function BillingScreen({ onBack }: BillingScreenProps) {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<{ [id: string]: number }>({});
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi">("cash");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [prodRes, custRes] = await Promise.all([getProducts(), getCustomers()]);
      const pList = Array.isArray(prodRes) ? prodRes : (prodRes as any).items || [];
      const cList = Array.isArray(custRes) ? custRes : (custRes as any).items || [];
      setProducts(pList);
      setCustomers(cList);
    } catch (e) {
      console.log("Load error", e);
    } finally {
      setLoading(false);
    }
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

  const handleCreateBill = async () => {
    if (Object.keys(cart).length === 0) {
      Alert.alert("ભૂલ", "કૃપા કરીને પહેલા પ્રોડક્ટ ઉમેરો");
      return;
    }

    setSubmitting(true);
    try {
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

      const payload: any = {
        customer_id: selectedCustomer ? selectedCustomer.id : null,
        items,
        payments,
      };

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

      // વેબ જેવો જ સંપૂર્ણ મેસેજ
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
        "સફળતા! 🎉",
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
      Alert.alert("ભૂલ", err.message || "બિલ બનાવવામાં સમસ્યા આવી");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા જાઓ</Text>
        </TouchableOpacity>
        <Text style={styles.title}>નવું બિલ બનાવો (POS)</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            data={products}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: 14 }}
            renderItem={({ item }) => {
              const qty = cart[item.id] || 0;
              const tax = Number(item.tax_percent) || 0;
              return (
                <View style={styles.card}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prodName}>{item.name}</Text>
                    <Text style={styles.prodPrice}>
                      ₹{item.selling_price} {tax > 0 ? `(+${tax}% GST)` : ""}
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

          <View style={styles.bottomBar}>
            <View>
              <Text style={styles.totalLabel}>
                ટેક્સ સાથે કુલ રકમ (GST: ₹{totals.taxTotal.toFixed(2)})
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
  backBtn: { marginRight: 14 },
  backText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
  card: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    alignItems: "center",
  },
  prodName: { fontSize: 15, fontWeight: "700", color: "#1E293B" },
  prodPrice: { fontSize: 14, color: "#10B981", fontWeight: "600", marginTop: 4 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyBtn: {
    backgroundColor: "#E2E8F0",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: { fontSize: 18, fontWeight: "700" },
  qtyText: { fontSize: 16, fontWeight: "700" },
  addBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  paymentSelector: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  payLabel: { fontSize: 13, fontWeight: "600", color: "#475569", marginBottom: 6 },
  payOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#F1F5F9",
  },
  payOptionActive: { backgroundColor: "#DBEAFE", borderWidth: 1, borderColor: "#2563EB" },
  payText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  payTextActive: { color: "#1D4ED8", fontWeight: "700" },
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
  totalVal: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  checkoutBtn: {
    backgroundColor: "#10B981",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  checkoutText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});