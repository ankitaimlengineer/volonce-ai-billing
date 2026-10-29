import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import {
  Me,
  getBusinessProfile,
  updateBusinessProfile,
  uploadBusinessBranding,
  updateBusinessSettings,
  completeBusinessSetup,
} from "../api";
import { colors } from "../theme";

interface Props {
  user: Me;
  onComplete: () => void;
  onLogout: () => void;
}

const BUSINESS_TYPES = [
  { key: "retail", label: "Retail (છૂટક વેપાર)" },
  { key: "wholesale", label: "Wholesale (જથ્થાબંધ)" },
  { key: "distributor", label: "Distributor (વિતરક)" },
  { key: "manufacturer", label: "Manufacturer (ઉત્પાદક)" },
  { key: "service", label: "Service (સર્વિસ)" },
  { key: "other", label: "Other (અન્ય)" },
];

const BUSINESS_CATEGORIES = [
  { key: "general_store", label: "General Store / કરિયાણું" },
  { key: "agro_shop", label: "Agro Shop (ખાતર-દવા-બિયારણ)" },
  { key: "clothing", label: "Clothing / કાપડ" },
  { key: "electronics", label: "Electronics" },
  { key: "mobile", label: "Mobile Shop" },
  { key: "hardware", label: "Hardware" },
  { key: "bakery", label: "Bakery / ડેરી" },
  { key: "pharmacy", label: "Pharmacy / મેડિકલ" },
  { key: "spare_parts", label: "Auto Spare Parts" },
  { key: "other", label: "Other (અન્ય)" },
];

const TEMPLATES = [
  { key: "professional", label: "🟢 Professional (પ્રમાણિત)" },
  { key: "minimal", label: "⚪ Minimal (સરળ)" },
  { key: "modern", label: "🔵 Modern (આધુનિક)" },
  { key: "retail", label: "🟡 Retail (રિટેલ)" },
  { key: "wholesale", label: "🟤 Wholesale (હોલસેલ)" },
];

export default function BusinessSetupScreen({ user, onComplete, onLogout }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Step 1: Profile Fields
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState(user.full_name || "");
  const [businessType, setBusinessType] = useState("retail");
  const [businessCategory, setBusinessCategory] = useState("general_store");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState(user.email || "");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Gujarat");
  const [state, setState] = useState("Gujarat");
  const [pincode, setPincode] = useState("380001");
  const [gstNumber, setGstNumber] = useState("");

  // Step 2: Branding Fields
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [signatureUri, setSignatureUri] = useState<string | null>(null);

  // Step 3: Settings Fields
  const [template, setTemplate] = useState("professional");
  const [prefix, setPrefix] = useState("INV");
  const [bankName, setBankName] = useState("");
  const [bankAccHolder, setBankAccHolder] = useState("");
  const [bankAccNo, setBankAccNo] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [upiId, setUpiId] = useState("");
  const [terms, setTerms] = useState("૧. માલ વેચાયા પછી પરત લેવામાં આવશે નહીં.\n૨. વિવાદ માટે સ્થાનિક ન્યાયક્ષેત્ર માન્ય રહેશે.");
  const [footer, setFooter] = useState("મુલાકાત બદલ આભાર! ફરી પધારશો.");

  useEffect(() => {
    getBusinessProfile()
      .then((res) => {
        if (res?.profile) {
          setName(res.profile.name || "");
          setOwnerName(res.profile.owner_name || user.full_name || "");
          if (res.profile.mobile) setMobile(res.profile.mobile);
          if (res.profile.address) setAddress(res.profile.address);
          if (res.profile.city) setCity(res.profile.city);
          if (res.profile.pincode) setPincode(res.profile.pincode);
          if (res.profile.gst_number) setGstNumber(res.profile.gst_number);
          if (res.profile.business_type) setBusinessType(res.profile.business_type);
          if (res.profile.business_category) setBusinessCategory(res.profile.business_category);
        }
      })
      .catch((e) => console.log("Profile load note:", e))
      .finally(() => setFetching(false));
  }, [user]);

  // Step 1 Submit
  const handleSaveStep1 = async () => {
    if (!name.trim()) return Alert.alert("ભૂલ", "દુકાનનું નામ લખવું જરૂરી છે.");
    if (!mobile.trim()) return Alert.alert("ભૂલ", "મોબાઈલ નંબર લખવો જરૂરી છે.");
    if (!address.trim()) return Alert.alert("ભૂલ", "દુકાનનું સરનામું લખવું જરૂરી છે.");
    if (!city.trim() || !pincode.trim()) return Alert.alert("ભૂલ", "શહેર અને પીનકોડ લખો.");

    setLoading(true);
    try {
      await updateBusinessProfile({
        name: name.trim(),
        owner_name: ownerName.trim() || undefined,
        business_type: businessType,
        business_category: businessCategory,
        mobile: mobile.trim(),
        email: email.trim() || undefined,
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        gst_number: gstNumber.trim() || undefined,
      });
      setStep(2);
    } catch (e: any) {
      Alert.alert("ભૂલ", e.message || "વિગત સેવ થઈ શકી નથી.");
    } finally {
      setLoading(false);
    }
  };

  // Image Picker for Logo / Signature
  const pickImage = async (kind: "logo" | "signature") => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]?.uri) {
      const uri = res.assets[0].uri;
      if (kind === "logo") setLogoUri(uri);
      else setSignatureUri(uri);

      // બેકએન્ડ પર તરત અપલોડ કરો
      try {
        await uploadBusinessBranding(kind, uri);
      } catch (err: any) {
        Alert.alert("અપલોડ ભૂલ", err.message || "ઈમેજ અપલોડ થઈ શકી નથી.");
      }
    }
  };

  // Step 3 Finish
  const handleFinishSetup = async () => {
    setLoading(true);
    try {
      await updateBusinessSettings({
        invoice_template: template,
        invoice_prefix: prefix.trim() || "INV",
        invoice_number_padding: 5,
        bank_name: bankName.trim() || undefined,
        bank_account_holder: bankAccHolder.trim() || undefined,
        bank_account_number: bankAccNo.trim() || undefined,
        bank_ifsc: bankIfsc.trim() || undefined,
        upi_id: upiId.trim() || undefined,
        terms_and_conditions: terms.trim() || undefined,
        invoice_footer: footer.trim() || undefined,
      });

      await completeBusinessSetup();
      Alert.alert("અભિનંદન! 🎉", "તમારી દુકાનનું સેટઅપ સફળતાપૂર્વક પૂર્ણ થઈ ગયું છે!");
      onComplete();
    } catch (e: any) {
      Alert.alert("ભૂલ", e.message || "સેટઅપ પૂર્ણ કરવામાં સમસ્યા આવી.");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>વિગતો લોડ થઈ રહી છે...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandTitle}>VOLONCE AI BILLING</Text>
          <Text style={styles.stepTitle}>
            {step === 1 && "પગલું ૧/૩: દુકાનની વિગતો (Profile)"}
            {step === 2 && "પગલું ૨/૩: લોગો & સહી (Branding)"}
            {step === 3 && "પગલું ૩/૩: બિલ & બેંક સેટિંગ્સ"}
          </Text>
        </View>
        <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>લૉગઆઉટ</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* ---------------- STEP 1: BUSINESS PROFILE ---------------- */}
        {step === 1 && (
          <View style={styles.card}>
            <Text style={styles.secHeading}>🏪 તમારી દુકાન અથવા પેઢીની વિગત</Text>
            <Text style={styles.secSub}>આ વિગતો તમારા તમામ બિલ પર આપોઆપ છપાશે.</Text>

            <Text style={styles.label}>દુકાનનું નામ (Business Name) *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="દા.ત. શ્રીજી ટ્રેડર્સ" />

            <Text style={styles.label}>માલિકનું પૂરું નામ (Owner Name) *</Text>
            <TextInput style={styles.input} value={ownerName} onChangeText={setOwnerName} placeholder="દા.ત. રમેશભાઈ પટેલ" />

            <Text style={styles.label}>વેપારનો પ્રકાર (Business Type) *</Text>
            <View style={styles.chipRow}>
              {BUSINESS_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.chip, businessType === t.key && styles.chipActive]}
                  onPress={() => setBusinessType(t.key)}
                >
                  <Text style={[styles.chipText, businessType === t.key && styles.chipTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>દુકાનની કેટેગરી (Business Category) *</Text>
            <View style={styles.chipRow}>
              {BUSINESS_CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.chip, businessCategory === c.key && styles.chipActive]}
                  onPress={() => setBusinessCategory(c.key)}
                >
                  <Text style={[styles.chipText, businessCategory === c.key && styles.chipTextActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>મોબાઈલ નંબર *</Text>
                <TextInput style={styles.input} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>GSTIN (વૈકલ્પિક)</Text>
                <TextInput style={styles.input} value={gstNumber} onChangeText={setGstNumber} autoCapitalize="characters" />
              </View>
            </View>

            <Text style={styles.label}>દુકાનનું સરનામું (Address) *</Text>
            <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="શેરી, માર્કેટ કે દુકાન નંબર" />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>શહેર (City) *</Text>
                <TextInput style={styles.input} value={city} onChangeText={setCity} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>પીનકોડ *</Text>
                <TextInput style={styles.input} value={pincode} onChangeText={setPincode} keyboardType="numeric" />
              </View>
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveStep1} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>આગળ વધો (Next Step) →</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ---------------- STEP 2: BRANDING (LOGO & SIGNATURE) ---------------- */}
        {step === 2 && (
          <View style={styles.card}>
            <Text style={styles.secHeading}>🎨 લોગો અને ઓથોરાઇઝ્ડ સહી (Branding)</Text>
            <Text style={styles.secSub}>બિલમાં તમારો લોગો અને સહી આપોઆપ આવી જશે (વૈકલ્પિક છે, પછી પણ બદલી શકાય).</Text>

            {/* Logo Box */}
            <View style={styles.uploadBox}>
              <Text style={styles.uploadTitle}>દુકાનનો લોગો (Business Logo)</Text>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.previewThumb} />
              ) : (
                <Text style={styles.emptyThumbText}>કોઈ લોગો પસંદ કરેલ નથી</Text>
              )}
              <TouchableOpacity style={styles.pickerBtn} onPress={() => pickImage("logo")}>
                <Text style={styles.pickerBtnText}>📷 લોગો પસંદ કરો</Text>
              </TouchableOpacity>
            </View>

            {/* Signature Box */}
            <View style={styles.uploadBox}>
              <Text style={styles.uploadTitle}>ઓથોરાઇઝ્ડ સહી (Authorized Signature)</Text>
              {signatureUri ? (
                <Image source={{ uri: signatureUri }} style={styles.previewThumb} />
              ) : (
                <Text style={styles.emptyThumbText}>કાગળ પર સહી કરીને ફોટો અપલોડ કરી શકો છો</Text>
              )}
              <TouchableOpacity style={styles.pickerBtn} onPress={() => pickImage("signature")}>
                <Text style={styles.pickerBtnText}>✍️ સહીનો ફોટો પસંદ કરો</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 15 }}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep(1)}>
                <Text style={styles.secondaryBtnText}>← પાછળ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={() => setStep(3)}>
                <Text style={styles.primaryBtnText}>આગળ વધો (Next Step) →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ---------------- STEP 3: INVOICE SETTINGS & COMPLETE ---------------- */}
        {step === 3 && (
          <View style={styles.card}>
            <Text style={styles.secHeading}>🧾 બિલિંગ અને બેંક ખાતાની વિગત</Text>
            <Text style={styles.secSub}>ગ્રાહકને બિલ પર તમારો UPI QR કોડ અને બેંક ખાતું દેખાશે.</Text>

            <Text style={styles.label}>ઇન્વોઇસ ટેમ્પલેટ પસંદ કરો</Text>
            <View style={styles.chipRow}>
              {TEMPLATES.map((tp) => (
                <TouchableOpacity
                  key={tp.key}
                  style={[styles.chip, template === tp.key && styles.chipActive]}
                  onPress={() => setTemplate(tp.key)}
                >
                  <Text style={[styles.chipText, template === tp.key && styles.chipTextActive]}>
                    {tp.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>બિલ પ્રીફિક્સ (Invoice Prefix)</Text>
            <TextInput style={styles.input} value={prefix} onChangeText={setPrefix} placeholder="INV" />

            <Text style={[styles.label, { marginTop: 15 }]}>તમારું UPI ID (Google Pay / PhonePe QR માટે)</Text>
            <TextInput style={styles.input} value={upiId} onChangeText={setUpiId} placeholder="દા.ત. store@okaxis" />

            <Text style={styles.label}>બેંકનું નામ (Bank Name)</Text>
            <TextInput style={styles.input} value={bankName} onChangeText={setBankName} placeholder="દા.ત. SBI, HDFC Bank" />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>ખાતા નંબર (A/C No)</Text>
                <TextInput style={styles.input} value={bankAccNo} onChangeText={setBankAccNo} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>IFSC કોડ</Text>
                <TextInput style={styles.input} value={bankIfsc} onChangeText={setBankIfsc} autoCapitalize="characters" />
              </View>
            </View>

            <Text style={styles.label}>શરતો અને નિયમો (Terms & Conditions)</Text>
            <TextInput style={[styles.input, { height: 60 }]} value={terms} onChangeText={setTerms} multiline />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 15 }}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep(2)}>
                <Text style={styles.secondaryBtnText}>← પાછળ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.finishBtn, { flex: 1 }]} onPress={handleFinishSetup} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>✓ સેટઅપ પૂર્ણ કરો (Finish)</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ECFDF5" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#047857", fontWeight: "700" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  brandTitle: { fontSize: 11, fontWeight: "800", color: "#047857", letterSpacing: 1 },
  stepTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A", marginTop: 2 },
  logoutBtn: { backgroundColor: "#FEE2E2", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  logoutText: { color: "#EF4444", fontSize: 11, fontWeight: "700" },
  scrollContent: { padding: 14, paddingBottom: 40 },
  card: { backgroundColor: "#FFFFFF", padding: 18, borderRadius: 16, elevation: 2 },
  secHeading: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  secSub: { fontSize: 12, color: "#64748B", marginTop: 2, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: "700", color: "#334155", marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#0F172A",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: 4 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipActive: { backgroundColor: "#D1FAE5", borderColor: "#059669" },
  chipText: { fontSize: 11, color: "#475569", fontWeight: "600" },
  chipTextActive: { color: "#065F46", fontWeight: "800" },
  primaryBtn: {
    backgroundColor: "#047857",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 18,
    elevation: 2,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  secondaryBtn: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#334155", fontSize: 13, fontWeight: "700" },
  finishBtn: {
    backgroundColor: "#0F172A",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    elevation: 2,
  },
  uploadBox: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: "center",
  },
  uploadTitle: { fontSize: 13, fontWeight: "700", color: "#1E293B", marginBottom: 6 },
  previewThumb: { width: 70, height: 70, borderRadius: 8, marginBottom: 8, objectFit: "contain" },
  emptyThumbText: { fontSize: 11, color: "#94A3B8", marginVertical: 10 },
  pickerBtn: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CBD5E1", paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8 },
  pickerBtnText: { fontSize: 12, fontWeight: "700", color: "#334155" },
});