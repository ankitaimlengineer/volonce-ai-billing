import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
  Image,
  Linking,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import {
  scanBillImage,
  createInvoice,
  downloadInvoicePdf,
  printInvoicePdf,
  shareOrSavePdf,
  ScannedItem,
} from "../api";
import { colors } from "../theme";

interface Props {
  onBack: () => void;
}

export default function AiCameraBillingScreen({ onBack }: Props) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi">("cash");

  // સફળતા મોડલ માટે સ્ટેટ્સ
  const [createdInvoice, setCreatedInvoice] = useState<any | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // ૧. કેમેરાથી ફોટો લો
  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("પરવાનગી જરૂરી", "બિલ સ્કેન કરવા માટે કેમેરાની પરવાનગી આપો.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      processPhoto(result.assets[0].uri);
    }
  };

  // ૨. ગેલેરીમાંથી પસંદ કરો
  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      processPhoto(result.assets[0].uri);
    }
  };

  // ૩. AI Backend પર મોકલો
  const processPhoto = async (uri: string) => {
    setImageUri(uri);
    setLoading(true);
    try {
      const data = await scanBillImage(uri);
      setItems(data.items || []);
    } catch (err: any) {
      Alert.alert("સ્કેન ભૂલ", err.message || "પ્રોડક્ટ્સ ઓળખવામાં સમસ્યા આવી.");
    } finally {
      setLoading(false);
    }
  };

  // જથ્થો (+ / -) ફેરફાર
  const updateQty = (index: number, newQty: number) => {
    if (newQty < 1) return;
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const rate = Number(item.rate) || 0;
        const taxRate = Number(item.tax_percent) || 0;
        const base = rate * newQty;
        const tax = (base * taxRate) / 100;
        return {
          ...item,
          quantity: newQty,
          total: Math.round((base + tax) * 100) / 100,
        };
      })
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const grandTotal = items.reduce((acc, it) => acc + (Number(it.total) || 0), 0);

  // ૪. બિલ કન્ફર્મ કરો
  const handleConfirmBill = async () => {
    if (items.length === 0) {
      Alert.alert("ધ્યાન આપો", "બિલમાં ઓછામાં ઓછી ૧ પ્રોડક્ટ હોવી જરૂરી છે.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        customer_id: null,
        items: items.map((i) => ({
          product_id: i.matched_product_id,
          quantity: i.quantity,
          discount_percent: 0,
        })),
        payments: [
          {
            method: paymentMethod,
            amount: grandTotal,
          },
        ],
      };

      const invoiceRes = await createInvoice(payload);
      setCreatedInvoice(invoiceRes); // મોડલ ઓપન થશે
    } catch (err: any) {
      Alert.alert("ભૂલ", err.message || "બિલ બનાવવામાં સમસ્યા આવી.");
    } finally {
      setSubmitting(false);
    }
  };

  // WhatsApp પર મોકલવા માટે
  const handleSendWhatsApp = () => {
    if (!createdInvoice) return;

    const invNumber = createdInvoice.invoice_number || `INV-${Date.now().toString().slice(-6)}`;
    const invDate = createdInvoice.invoice_date || new Date().toISOString().slice(0, 10);
    const subtotalVal = Number(createdInvoice.subtotal || grandTotal).toFixed(2);
    const taxTotalVal = Number(createdInvoice.tax_total || 0).toFixed(2);
    const grandTotalVal = Number(createdInvoice.grand_total || grandTotal).toFixed(2);

    const itemsList = items
      .map(
        (it) =>
          `• *${it.matched_product_name || it.raw_name}* (જથ્થો: ${it.quantity}) = ₹${Number(it.total).toFixed(2)}`
      )
      .join("\n");

    const msg = 
`🧾 *ટેક્સ ઇન્વોઇસ - VOLONCE AI STORE*
━━━━━━━━━━━━━━━━━━━━
👤 *ગ્રાહક:* Walk-in Customer
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

    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("WhatsApp", "WhatsApp ખોલી શકાયું નથી.");
    });
  };

  // PDF ડાઉનલોડ કરવા માટે
  const handleDownloadPdf = async () => {
    if (!createdInvoice) return;
    setPdfBusy(true);
    try {
      const uri = await downloadInvoicePdf(createdInvoice.id, createdInvoice.invoice_number);
      await shareOrSavePdf(uri);
    } catch (err: any) {
      Alert.alert("PDF ડાઉનલોડ ભૂલ", err.message || "PDF ડાઉનલોડ થઈ શકી નથી.");
    } finally {
      setPdfBusy(false);
    }
  };

  // પ્રિન્ટ કરવા માટે
  const handlePrint = async () => {
    if (!createdInvoice) return;
    setPdfBusy(true);
    try {
      const uri = await downloadInvoicePdf(createdInvoice.id, createdInvoice.invoice_number);
      await printInvoicePdf(uri);
    } catch (err: any) {
      Alert.alert("પ્રિન્ટ ભૂલ", err.message || "પ્રિન્ટર સાથે કનેક્ટ થઈ શક્યું નથી.");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા જાઓ</Text>
        </TouchableOpacity>
        <Text style={styles.title}>📸 AI કેમેરા બિલિંગ</Text>
      </View>

      {/* Camera Capture Section */}
      {!imageUri || items.length === 0 ? (
        <View style={styles.captureBox}>
          {loading ? (
            <View style={{ alignItems: "center" }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>🤖 AI પ્રોડક્ટ્સ ઓળખી રહ્યું છે...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.guideTitle}>સામાનનો ફોટો પાડો</Text>
              <Text style={styles.guideSub}>કાઉન્ટર પર રાખેલા સામાનનો સ્પષ્ટ ફોટો લો</Text>

              <TouchableOpacity style={styles.cameraBtn} onPress={takePhoto}>
                <Text style={styles.cameraBtnText}>📷 કેમેરા શરૂ કરો (Take Photo)</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.galleryBtn} onPress={pickFromGallery}>
                <Text style={styles.galleryBtnText}>🖼️ ગેલેરીમાંથી પસંદ કરો</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : (
        /* AI Review & Edit Screen */
        <View style={{ flex: 1 }}>
          <View style={styles.previewBar}>
            {imageUri && <Image source={{ uri: imageUri }} style={styles.miniImg} />}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.previewSuccess}>✓ સ્કેન સફળ! {items.length} પ્રોડક્ટ્સ મળી</Text>
              <Text style={styles.previewSub}>જથ્થો બદલવા માટે + અથવા - દબાવો</Text>
            </View>
            <TouchableOpacity onPress={takePhoto} style={styles.retakeBtn}>
              <Text style={styles.retakeText}>ફરી લો 🔄</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={items}
            keyExtractor={(_, idx) => String(idx)}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item, index }) => (
              <View style={styles.itemCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.matched_product_name || item.raw_name}</Text>
                  <Text style={styles.itemRate}>દર: ₹{Number(item.rate).toFixed(2)}</Text>
                </View>

                <View style={styles.qtyContainer}>
                  <TouchableOpacity onPress={() => updateQty(index, item.quantity - 1)} style={styles.qtyBtn}>
                    <Text style={styles.qtyBtnText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{item.quantity}</Text>
                  <TouchableOpacity onPress={() => updateQty(index, item.quantity + 1)} style={styles.qtyBtn}>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.itemTotal}>₹{Number(item.total).toFixed(2)}</Text>

                <TouchableOpacity onPress={() => removeItem(index)} style={styles.deleteBtn}>
                  <Text style={styles.deleteText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
          />

          <View style={styles.payBar}>
            <Text style={styles.payLabel}>ચુકવણી પદ્ધતિ:</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setPaymentMethod("cash")}
                style={[styles.payBtn, paymentMethod === "cash" && styles.payBtnActive]}
              >
                <Text style={[styles.payBtnText, paymentMethod === "cash" && styles.payBtnTextActive]}>
                  💵 રોકડ (Cash)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPaymentMethod("upi")}
                style={[styles.payBtn, paymentMethod === "upi" && styles.payBtnActive]}
              >
                <Text style={[styles.payBtnText, paymentMethod === "upi" && styles.payBtnTextActive]}>
                  📱 UPI
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.bottomBar}>
            <View>
              <Text style={styles.totalLabel}>કુલ બિલ રકમ:</Text>
              <Text style={styles.totalValue}>₹{grandTotal.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.confirmBtn, submitting && { opacity: 0.6 }]}
              onPress={handleConfirmBill}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmText}>બિલ કન્ફર્મ કરો ✓</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* પાવરફુલ બિલ સક્સેસ મોડલ (WhatsApp + PDF Download + Print) */}
      <Modal visible={Boolean(createdInvoice)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEmoji}>🎉</Text>
            <Text style={styles.modalTitle}>બિલ તૈયાર છે!</Text>
            <Text style={styles.modalSub}>
              બિલ નં: <Text style={{ fontWeight: "800", color: "#0F172A" }}>{createdInvoice?.invoice_number}</Text>
            </Text>
            <Text style={styles.modalAmount}>
              કુલ રકમ: ₹{Number(createdInvoice?.grand_total || grandTotal).toFixed(2)}
            </Text>

            {/* બટન ૧: WhatsApp */}
            <TouchableOpacity style={styles.btnWhatsApp} onPress={handleSendWhatsApp}>
              <Text style={styles.btnWhatsAppText}>💬 WhatsApp પર મોકલો</Text>
            </TouchableOpacity>

            {/* બટન ૨: PDF ડાઉનલોડ */}
            <TouchableOpacity
              style={styles.btnPdf}
              onPress={handleDownloadPdf}
              disabled={pdfBusy}
            >
              {pdfBusy ? (
                <ActivityIndicator color="#047857" />
              ) : (
                <Text style={styles.btnPdfText}>📥 PDF ડાઉનલોડ કરો</Text>
              )}
            </TouchableOpacity>

            {/* બટન ૩: પ્રિન્ટ */}
            <TouchableOpacity
              style={styles.btnPrint}
              onPress={handlePrint}
              disabled={pdfBusy}
            >
              <Text style={styles.btnPrintText}>🖨️ પ્રિન્ટ કરો (Print Bill)</Text>
            </TouchableOpacity>

            {/* બટન ૪: પૂર્ણ (Done) */}
            <TouchableOpacity
              style={styles.btnDone}
              onPress={() => {
                setCreatedInvoice(null);
                onBack();
              }}
            >
              <Text style={styles.btnDoneText}>પૂર્ણ (Done)</Text>
            </TouchableOpacity>
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
  backBtn: { marginRight: 12 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
  captureBox: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  guideTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A", marginBottom: 6 },
  guideSub: { fontSize: 13, color: "#64748B", marginBottom: 24, textAlign: "center" },
  cameraBtn: {
    backgroundColor: "#047857",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginBottom: 12,
    width: "100%",
    alignItems: "center",
    elevation: 2,
  },
  cameraBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  galleryBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  galleryBtnText: { color: "#334155", fontSize: 15, fontWeight: "600" },
  loadingText: { marginTop: 14, fontSize: 14, fontWeight: "600", color: "#047857" },
  previewBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#ECFDF5",
    borderBottomWidth: 1,
    borderBottomColor: "#A7F3D0",
  },
  miniImg: { width: 44, height: 44, borderRadius: 6, backgroundColor: "#000" },
  previewSuccess: { fontSize: 13, fontWeight: "700", color: "#065F46" },
  previewSub: { fontSize: 11, color: "#047857" },
  retakeBtn: { padding: 6 },
  retakeText: { fontSize: 12, color: "#065F46", fontWeight: "700" },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    elevation: 1,
  },
  itemName: { fontSize: 14, fontWeight: "700", color: "#1E293B" },
  itemRate: { fontSize: 12, color: "#64748B", marginTop: 2 },
  qtyContainer: { flexDirection: "row", alignItems: "center", marginHorizontal: 8 },
  qtyBtn: {
    width: 28,
    height: 28,
    backgroundColor: "#F1F5F9",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyBtnText: { fontSize: 16, fontWeight: "800", color: "#334155" },
  qtyValue: { fontSize: 14, fontWeight: "700", marginHorizontal: 8 },
  itemTotal: { fontSize: 14, fontWeight: "800", color: "#047857", minWidth: 65, textAlign: "right" },
  deleteBtn: { padding: 6, marginLeft: 6 },
  deleteText: { color: "#94A3B8", fontWeight: "700", fontSize: 14 },
  payBar: {
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  payLabel: { fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 },
  payBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#F1F5F9",
  },
  payBtnActive: { backgroundColor: "#D1FAE5", borderWidth: 1, borderColor: "#059669" },
  payBtnText: { fontSize: 13, color: "#64748B", fontWeight: "600" },
  payBtnTextActive: { color: "#065F46", fontWeight: "700" },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  totalLabel: { fontSize: 12, color: "#64748B" },
  totalValue: { fontSize: 22, fontWeight: "800", color: "#0F172A" },
  confirmBtn: {
    backgroundColor: "#047857",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
  },
  confirmText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },

  // મોડલ સ્ટાઇલિંગ
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    elevation: 8,
  },
  modalEmoji: { fontSize: 44, marginBottom: 8 },
  modalTitle: { fontSize: 22, fontWeight: "800", color: "#0F172A", marginBottom: 6 },
  modalSub: { fontSize: 14, color: "#64748B", marginBottom: 4 },
  modalAmount: { fontSize: 24, fontWeight: "900", color: "#047857", marginBottom: 20 },
  btnWhatsApp: {
    backgroundColor: "#16A34A",
    width: "100%",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  btnWhatsAppText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  btnPdf: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1.5,
    borderColor: "#059669",
    width: "100%",
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  btnPdfText: { color: "#047857", fontSize: 15, fontWeight: "700" },
  btnPrint: {
    backgroundColor: "#0F172A",
    width: "100%",
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  btnPrintText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  btnDone: { paddingVertical: 8 },
  btnDoneText: { color: "#64748B", fontSize: 14, fontWeight: "600" },
});