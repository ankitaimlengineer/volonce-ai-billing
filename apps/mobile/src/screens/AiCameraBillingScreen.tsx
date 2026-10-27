import React, { useState, useEffect } from "react";
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
  createCameraSession,
  addImageToCameraSession,
  getSessionDraftBill,
  createInvoice,
  downloadInvoicePdf,
  savePdfToPhone,
  sharePdfFile,
  printInvoicePdf,
  getProducts,
  Product,
} from "../api";
import { colors } from "../theme";

interface MobileDraftItem {
  product_id: string | null;
  name: string;
  quantity: number;
  rate: number;
  tax_percent: number;
  total: number;
  isMatched: boolean;
}

interface Props {
  onBack?: () => void;
  navigation?: any;
}

// સ્માર્ટ કેટલોગ મેચર: Kreo ને ક્યારેય Urea સાથે મેચ નહીં થવા દે
function findBestCatalogMatch(scannedName: string, catalog: Product[]): Product | null {
  if (!scannedName || !catalog || catalog.length === 0) return null;

  const cleanScanned = scannedName.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const scannedWords = cleanScanned.split(/\s+/).filter((w) => w.length >= 3);

  // ૧. સીધું નામ કે સબસ્ટ્રિંગ મેચ
  for (const p of catalog) {
    const cleanP = p.name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
    if (cleanP === cleanScanned || cleanScanned.includes(cleanP) || cleanP.includes(cleanScanned)) {
      return p;
    }
  }

  // ૨. મહત્વના સામાન્ય શબ્દો સરખાવો (Kreo, GoRec, Duo)
  let bestMatch: Product | null = null;
  let maxCommonWords = 0;

  for (const p of catalog) {
    const cleanP = p.name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
    const pWords = cleanP.split(/\s+/).filter((w) => w.length >= 3);
    const commonCount = scannedWords.filter((w) => pWords.includes(w)).length;
    if (commonCount > maxCommonWords) {
      maxCommonWords = commonCount;
      bestMatch = p;
    }
  }

  if (maxCommonWords > 0 && bestMatch) {
    return bestMatch;
  }

  return null;
}

export default function AiCameraBillingScreen({ onBack, navigation }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [items, setItems] = useState<MobileDraftItem[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi">("cash");

  // સફળતા મોડલ સ્ટેટ્સ
  const [createdInvoice, setCreatedInvoice] = useState<any | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const handleGoBack = () => {
    if (onBack) onBack();
    else if (navigation?.goBack) navigation.goBack();
  };

  // પ્રારંભમાં સેશન અને કેટલોગ પ્રોડક્ટ્સ લાવો
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      createCameraSession("multiple"),
      getProducts(),
    ])
      .then(([sessionRes, prodsRes]) => {
        if (!isMounted) return;
        setSessionId(sessionRes.id);
        const pList = Array.isArray(prodsRes) ? prodsRes : (prodsRes as any).items || [];
        setCatalog(pList);
      })
      .catch((err) => console.log("Init error:", err));

    return () => {
      isMounted = false;
    };
  }, []);

  // કેમેરાથી ફોટો લો
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

  // ગેલેરીમાંથી પસંદ કરો
  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      processPhoto(result.assets[0].uri);
    }
  };

  // ફોટો પ્રોસેસિંગ અને ઓટો-મેચિંગ
  const processPhoto = async (uri: string) => {
    if (!sessionId) {
      Alert.alert("ભૂલ", "કેમેરા સેશન શરૂ થઈ શક્યું નથી. ફરી પ્રયાસ કરો.");
      return;
    }

    setPhotos((prev) => [...prev, uri]);
    setLoading(true);

    try {
      const res = await addImageToCameraSession(sessionId, uri);

      if (res.is_duplicate_photo) {
        Alert.alert(
          "ડુપ્લિકેટ ફોટો ચેતવણી",
          "આ ફોટો અગાઉ આવી ગયો હોય તેવો લાગે છે. સામાનનું ડબલ કાઉન્ટિંગ અટકાવવામાં આવ્યું છે."
        );
      }

      // ડ્રાફ્ટ ફેચ કરીને આપોઆપ Name, Rate, QTY અને Rakam લિંક કરો
      const draft = await getSessionDraftBill(sessionId);
      const formattedItems: MobileDraftItem[] = (draft.items || []).map((it: any) => {
        let pId = it.product_id;
        let finalName = it.name;
        let rate = Number(it.rate) || 0;
        let tax = Number(it.tax_percent) || 0;
        const qty = Number(it.quantity) || 1;
        let matchedFound = Boolean(pId && rate > 0);

        // જો બેકએન્ડમાંથી રેટ 0 આવ્યો હોય તો કેટલોગમાંથી ચોક્કસ Kreo શોધો
        if (!matchedFound) {
          const matched = findBestCatalogMatch(it.name, catalog);
          if (matched) {
            pId = matched.id;
            finalName = matched.name;
            rate = Number(matched.selling_price) || 0;
            tax = Number(matched.tax_percent) || 0;
            matchedFound = true;
          }
        }

        const base = rate * qty;
        const taxAmt = (base * tax) / 100;

        return {
          product_id: pId,
          name: finalName,
          quantity: qty,
          rate: rate,
          tax_percent: tax,
          total: Math.round((base + taxAmt) * 100) / 100,
          isMatched: matchedFound,
        };
      });

      setItems(formattedItems);
    } catch (err: any) {
      Alert.alert("સ્કેન ભૂલ", err.message || "પ્રોડક્ટ્સ ઓળખવામાં સમસ્યા આવી.");
    } finally {
      setLoading(false);
    }
  };

  // જથ્થો વધારવા/ઘટાડવા (+ / -)
  const updateQty = (index: number, newQty: number) => {
    if (newQty < 1) return;
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const base = item.rate * newQty;
        const taxAmt = (base * item.tax_percent) / 100;
        return {
          ...item,
          quantity: newQty,
          total: Math.round((base + taxAmt) * 100) / 100,
        };
      })
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const grandTotal = items.reduce((acc, it) => acc + (Number(it.total) || 0), 0);

  // બિલ કન્ફર્મ કરો
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
          product_id: i.product_id || catalog[0]?.id,
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
      setCreatedInvoice(invoiceRes);
    } catch (err: any) {
      Alert.alert("ભૂલ", err.message || "બિલ બનાવવામાં સમસ્યા આવી.");
    } finally {
      setSubmitting(false);
    }
  };

  // ૧. ફોનમાં ડાયરેક્ટ PDF ફાઈલ સેવ કરો (Downloads / Storage)
  const handleSaveToPhone = async () => {
    if (!createdInvoice) return;
    setActionBusy(true);
    try {
      const uri = await downloadInvoicePdf(createdInvoice.id, createdInvoice.invoice_number);
      const saved = await savePdfToPhone(uri, createdInvoice.invoice_number);
      if (saved) {
        Alert.alert("સફળતા! 📥", "PDF તમારા ફોનના સ્ટોરેજ / Downloads ફોલ્ડરમાં સેવ થઈ ગઈ છે!");
      }
    } catch (err: any) {
      Alert.alert("સેવ ભૂલ", err.message || "PDF સેવ થઈ શકી નથી.");
    } finally {
      setActionBusy(false);
    }
  };

  // ૨. PDF ફાઇલ WhatsApp / Drive / Bluetooth પર શેર કરો
  const handleSharePdf = async () => {
    if (!createdInvoice) return;
    setActionBusy(true);
    try {
      const uri = await downloadInvoicePdf(createdInvoice.id, createdInvoice.invoice_number);
      await sharePdfFile(uri);
    } catch (err: any) {
      Alert.alert("શેર ભૂલ", err.message || "PDF શેર થઈ શકી નથી.");
    } finally {
      setActionBusy(false);
    }
  };

  // ૩. WhatsApp ટેક્સ્ટ મેસેજ
  const handleSendWhatsAppText = () => {
    if (!createdInvoice) return;

    const invNumber = createdInvoice.invoice_number || `INV-${Date.now().toString().slice(-6)}`;
    const invDate = createdInvoice.invoice_date || new Date().toISOString().slice(0, 10);
    const grandTotalVal = Number(createdInvoice.grand_total || grandTotal).toFixed(2);

    const itemsList = items
      .map(
        (it) =>
          `• *${it.name}* (જથ્થો: ${it.quantity}) = ₹${Number(it.total).toFixed(2)}`
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
💰 *કુલ રકમ:* *₹${grandTotalVal}*
✅ *પેમેન્ટ સ્ટેટસ:* ચૂકતે (${paymentMethod.toUpperCase()})

🙏 *મુલાકાત બદલ ખૂબ ખૂબ આભાર! ફરી પધારશો.*`;

    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("WhatsApp", "WhatsApp ખોલી શકાયું નથી.");
    });
  };

  // ૪. પ્રિન્ટ
  const handlePrint = async () => {
    if (!createdInvoice) return;
    setActionBusy(true);
    try {
      const uri = await downloadInvoicePdf(createdInvoice.id, createdInvoice.invoice_number);
      await printInvoicePdf(uri);
    } catch (err: any) {
      Alert.alert("પ્રિન્ટ ભૂલ", err.message || "પ્રિન્ટર સાથે કનેક્ટ થઈ શક્યું નથી.");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા જાઓ</Text>
        </TouchableOpacity>
        <Text style={styles.title}>📸 AI કેમેરા બિલિંગ (Smart POS)</Text>
      </View>

      {photos.length === 0 ? (
        <View style={styles.captureBox}>
          <Text style={styles.guideTitle}>સામાનના ફોટા પાડો</Text>
          <Text style={styles.guideSub}>કેમેરા સામે પ્રોડક્ટનું બોક્સ અથવા પેકેટ રાખો</Text>

          <TouchableOpacity style={styles.cameraBtn} onPress={takePhoto}>
            <Text style={styles.cameraBtnText}>📷 પહેલો ફોટો લો (Take Photo)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.galleryBtn} onPress={pickFromGallery}>
            <Text style={styles.galleryBtnText}>🖼️ ગેલેરીમાંથી પસંદ કરો</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.previewBar}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={photos}
              keyExtractor={(_, idx) => String(idx)}
              renderItem={({ item, index }) => (
                <View style={styles.photoThumbContainer}>
                  <Image source={{ uri: item }} style={styles.miniImg} />
                  <Text style={styles.photoIndexBadge}>#{index + 1}</Text>
                </View>
              )}
            />
            <TouchableOpacity onPress={takePhoto} style={styles.retakeBtn} disabled={loading}>
              <Text style={styles.retakeText}>➕ બીજો ફોટો</Text>
            </TouchableOpacity>
          </View>

          {loading && (
            <View style={styles.loadingStrip}>
              <ActivityIndicator size="small" color="#047857" />
              <Text style={styles.loadingStripText}>🤖 AI કેટલોગમાંથી સાચો ભાવ લિંક કરી રહ્યું છે...</Text>
            </View>
          )}

          {/* ૧૦૦% ઓટો-મેચ થયેલ સામાનનું લિસ્ટ */}
          <FlatList
            data={items}
            keyExtractor={(_, idx) => String(idx)}
            contentContainerStyle={{ padding: 12 }}
            renderItem={({ item, index }) => (
              <View style={styles.itemCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {item.isMatched ? (
                    <Text style={styles.matchedBadge}>✓ આપોઆપ મેચ થયેલ</Text>
                  ) : (
                    <Text style={styles.unmatchedBadge}>⚠️ કેટલોગમાં નથી</Text>
                  )}
                  <Text style={styles.itemRate}>દર: ₹{item.rate.toFixed(2)}</Text>
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

                <Text style={styles.itemTotal}>₹{item.total.toFixed(2)}</Text>

                <TouchableOpacity onPress={() => removeItem(index)} style={styles.deleteBtn}>
                  <Text style={styles.deleteText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              !loading ? (
                <Text style={styles.emptyItemsText}>હજુ કોઈ સામાન ઉમેરાયો નથી. વધુ ફોટો લો.</Text>
              ) : null
            }
          />

          {/* Payment Method Selector */}
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

          {/* Bottom Confirm Bar */}
          <View style={styles.bottomBar}>
            <View>
              <Text style={styles.totalLabel}>કુલ બિલ રકમ:</Text>
              <Text style={styles.totalValue}>₹{grandTotal.toFixed(2)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.confirmBtn, (submitting || loading) && { opacity: 0.6 }]}
              onPress={handleConfirmBill}
              disabled={submitting || loading}
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

      {/* સફળતા મોડલ (Save to Phone + Share File + Print) */}
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

            {/* ૧. ફોનમાં ડાયરેક્ટ PDF સેવ કરો */}
            <TouchableOpacity style={styles.btnSavePhone} onPress={handleSaveToPhone} disabled={actionBusy}>
              <Text style={styles.btnSavePhoneText}>📥 ફોનમાં PDF સેવ કરો (Download)</Text>
            </TouchableOpacity>

            {/* ૨. અસલ PDF ફાઇલ શેર કરો (WhatsApp, Drive, Bluetooth) */}
            <TouchableOpacity style={styles.btnSharePdf} onPress={handleSharePdf} disabled={actionBusy}>
              <Text style={styles.btnSharePdfText}>📤 PDF ફાઈલ શેર કરો</Text>
            </TouchableOpacity>

            {/* ૩. WhatsApp સમરી મેસેજ */}
            <TouchableOpacity style={styles.btnWhatsAppTextMsg} onPress={handleSendWhatsAppText}>
              <Text style={styles.btnWhatsAppTextMsgText}>💬 WhatsApp મેસેજ મોકલો</Text>
            </TouchableOpacity>

            {/* ૪. પ્રિન્ટ */}
            <TouchableOpacity style={styles.btnPrint} onPress={handlePrint} disabled={actionBusy}>
              <Text style={styles.btnPrintText}>🖨️ પ્રિન્ટ કરો (Print Bill)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnDone}
              onPress={() => {
                setCreatedInvoice(null);
                handleGoBack();
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
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  captureBox: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  guideTitle: { fontSize: 22, fontWeight: "800", color: "#0F172A", marginBottom: 6 },
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
  previewBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#ECFDF5",
    borderBottomWidth: 1,
    borderBottomColor: "#A7F3D0",
  },
  photoThumbContainer: { position: "relative", marginRight: 8 },
  miniImg: { width: 50, height: 50, borderRadius: 8, backgroundColor: "#000" },
  photoIndexBadge: {
    position: "absolute",
    bottom: 2,
    left: 2,
    backgroundColor: "rgba(0,0,0,0.6)",
    color: "#fff",
    fontSize: 9,
    fontWeight: "bold",
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  retakeBtn: {
    backgroundColor: "#047857",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 6,
  },
  retakeText: { fontSize: 12, color: "#FFFFFF", fontWeight: "700" },
  loadingStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    backgroundColor: "#FEF3C7",
  },
  loadingStripText: { marginLeft: 8, fontSize: 12, color: "#92400E", fontWeight: "600" },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    elevation: 1,
  },
  itemName: { fontSize: 15, fontWeight: "800", color: "#1E293B" },
  matchedBadge: { color: "#047857", fontSize: 11, fontWeight: "700", marginTop: 2 },
  unmatchedBadge: { color: "#D97706", fontSize: 11, fontWeight: "700", marginTop: 2 },
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
  itemTotal: { fontSize: 15, fontWeight: "900", color: "#047857", minWidth: 65, textAlign: "right" },
  deleteBtn: { padding: 6, marginLeft: 6 },
  deleteText: { color: "#94A3B8", fontWeight: "700", fontSize: 14 },
  emptyItemsText: { textAlign: "center", color: "#94A3B8", marginTop: 40, fontSize: 13 },
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
  totalValue: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  confirmBtn: {
    backgroundColor: "#047857",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
  },
  confirmText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
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
  modalAmount: { fontSize: 24, fontWeight: "900", color: "#047857", marginBottom: 18 },
  btnSavePhone: {
    backgroundColor: "#0284C7",
    width: "100%",
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  btnSavePhoneText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  btnSharePdf: {
    backgroundColor: "#16A34A",
    width: "100%",
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  btnSharePdfText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  btnWhatsAppTextMsg: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  btnWhatsAppTextMsgText: { color: "#15803D", fontSize: 14, fontWeight: "700" },
  btnPrint: {
    backgroundColor: "#0F172A",
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  btnPrintText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  btnDone: { paddingVertical: 8 },
  btnDoneText: { color: "#64748B", fontSize: 14, fontWeight: "600" },
});