import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { login, register } from "../api";
import { colors } from "../theme";

export default function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  // Mode: "login" અથવા "register"
  const [mode, setMode] = useState<"login" | "register">("login");

  // લૉગિન સ્ટેટ્સ
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // રજીસ્ટ્રેશન સ્ટેટ્સ
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ૧. લૉગિન સબમિટ
  async function handleLogin() {
    if (loading) return;
    if (!email.trim() || password.length < 8) {
      setError("ઈમેલ અને સાચો પાસવર્ડ (ઓછામાં ઓછા ૮ અક્ષર) લખો.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      onLoggedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "લૉગિન નિષ્ફળ ગયું.");
    } finally {
      setLoading(false);
    }
  }

  // ૨. નવું રજીસ્ટ્રેશન સબમિટ
  async function handleRegister() {
    if (loading) return;
    if (!businessName.trim() || businessName.trim().length < 2) {
      setError("દુકાન/પેઢીનું નામ ઓછામાં ઓછું ૨ અક્ષરનું હોવું જોઈએ.");
      return;
    }
    if (!fullName.trim() || fullName.trim().length < 2) {
      setError("તમારું પૂરું નામ લખવું જરૂરી છે.");
      return;
    }
    if (!regEmail.trim()) {
      setError("ઈમેલ એડ્રેસ લખવું જરૂરી છે.");
      return;
    }
    if (regPassword.length < 8) {
      setError("પાસવર્ડ ઓછામાં ઓછો ૮ અક્ષરનો હોવો જોઈએ.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await register({
        business_name: businessName.trim(),
        full_name: fullName.trim(),
        email: regEmail.trim(),
        mobile: mobile.trim(),
        password: regPassword,
      });
      // રજીસ્ટ્રેશન પૂરું થતાં જ ઓટોમેટિક સેટઅપ વિઝાર્ડ ખુલશે
      onLoggedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "રજીસ્ટ્રેશન નિષ્ફળ ગયું.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.brand}>VOLONCE AI BILLING</Text>
          <Text style={styles.title}>
            {mode === "login" ? "દુકાન લૉગિન (Login)" : "નવી દુકાન રજીસ્ટર કરો"}
          </Text>
          <Text style={styles.subtitle}>
            {mode === "login"
              ? "તમારા એકાઉન્ટમાં લૉગિન કરવા માટે વિગત દાખલ કરો"
              : "તમારી નવી દુકાન શરૂ કરવા માટે વિગત ભરો"}
          </Text>

          {!!error && <Text style={styles.error}>⚠️ {error}</Text>}

          {/* ---------------- MODE ૧: લૉગિન ફોર્મ ---------------- */}
          {mode === "login" ? (
            <View>
              <Text style={styles.label}>ઈમેલ (Email) *</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="દા.ત. ramesh@example.com"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.label}>પાસવર્ડ (Password) *</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder="••••••••"
                placeholderTextColor="#94A3B8"
                onSubmitEditing={handleLogin}
              />

              <Pressable
                style={[styles.button, loading && styles.disabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>લૉગિન કરો (Login) →</Text>
                )}
              </Pressable>

              {/* નીચે રજીસ્ટ્રેશન માટેની લિંક */}
              <TouchableOpacity
                onPress={() => {
                  setMode("register");
                  setError("");
                }}
                style={styles.switchModeBtn}
              >
                <Text style={styles.switchModeText}>
                  નવા વેપારી છો?{" "}
                  <Text style={{ color: colors.primary, fontWeight: "bold" }}>
                    અહીં નવું ખાતું બનાવો
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ---------------- MODE ૨: નવું રજીસ્ટ્રેશન ફોર્મ ---------------- */
            <View>
              <Text style={styles.label}>દુકાન / પેઢીનું નામ (Business Name) *</Text>
              <TextInput
                style={styles.input}
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="દા.ત. શ્રીજી ટ્રેડર્સ, પટેલ પ્રોવિઝન સ્ટોર"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.label}>માલિકનું પૂરું નામ (Owner Name) *</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="દા.ત. રમેશભાઈ પટેલ"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.label}>મોબાઈલ નંબર (Mobile Number)</Text>
              <TextInput
                style={styles.input}
                value={mobile}
                onChangeText={setMobile}
                keyboardType="phone-pad"
                placeholder="10 અંકનો મોબાઈલ નંબર"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.label}>ઈમેલ (Email) *</Text>
              <TextInput
                style={styles.input}
                value={regEmail}
                onChangeText={setRegEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="દા.ત. shreeji@gmail.com"
                placeholderTextColor="#94A3B8"
              />

              <Text style={styles.label}>નવો પાસવર્ડ (Password - 8+ અક્ષર) *</Text>
              <TextInput
                style={styles.input}
                value={regPassword}
                onChangeText={setRegPassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder="ઓછામાં ઓછા ૮ અક્ષર"
                placeholderTextColor="#94A3B8"
              />

              <Pressable
                style={[styles.button, loading && styles.disabled]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>✓ ખાતું બનાવો અને આગળ વધો →</Text>
                )}
              </Pressable>

              {/* નીચે લૉગિન માટેની લિંક */}
              <TouchableOpacity
                onPress={() => {
                  setMode("login");
                  setError("");
                }}
                style={styles.switchModeBtn}
              >
                <Text style={styles.switchModeText}>
                  પહેલેથી ખાતું છે?{" "}
                  <Text style={{ color: colors.primary, fontWeight: "bold" }}>
                    અહીં લૉગિન કરો
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ecfdf5" },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    paddingVertical: 35,
  },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 22, elevation: 4 },
  brand: { fontSize: 12, fontWeight: "800", color: "#047857", letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: "800", color: "#065f46", marginTop: 6 },
  subtitle: { fontSize: 12, color: "#64748B", marginBottom: 14, marginTop: 2 },
  label: { marginTop: 12, fontSize: 12, color: "#374151", fontWeight: "700" },
  input: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#F8FAFC",
  },
  button: {
    marginTop: 22,
    backgroundColor: "#047857",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    elevation: 2,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  switchModeBtn: { marginTop: 18, alignItems: "center", paddingVertical: 6 },
  switchModeText: { fontSize: 13, color: "#4B5563" },
  error: {
    marginTop: 8,
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    padding: 10,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "700",
  },
});