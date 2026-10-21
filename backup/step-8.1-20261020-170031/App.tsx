import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { API_PREFIX, API_URL } from "./src/config";
import { colors } from "./src/theme";

type Health =
  | { kind: "checking" }
  | { kind: "ok"; database: string }
  | { kind: "fail"; message: string };

// Phase 8.1 foundation screen: proves the app can reach the real backend.
export default function App() {
  const [health, setHealth] = useState<Health>({ kind: "checking" });

  const check = useCallback(async () => {
    setHealth({ kind: "checking" });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${API_URL}${API_PREFIX}/health`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Server e ${res.status} aapyo`);
      const data = (await res.json()) as { status: string; database: string };
      if (data.status !== "ok") throw new Error(`Database: ${data.database}`);
      setHealth({ kind: "ok", database: data.database });
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      setHealth({
        kind: "fail",
        message: aborted
          ? "Timeout. Wi-Fi, IP ane firewall check karo."
          : e instanceof Error
          ? e.message
          : "Connect thayu nathi",
      });
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.card}>
        <Text style={styles.brand}>VOLONCE AI BILLING</Text>
        <Text style={styles.title}>Mobile app taiyar che</Text>
        <Text style={styles.muted}>Backend: {API_URL}</Text>

        <View style={styles.statusRow}>
          {health.kind === "checking" && <ActivityIndicator color={colors.primary} />}
          {health.kind === "ok" && (
            <Text style={[styles.status, { color: colors.ok }]}>
              ✅ Backend connected (database: {health.database})
            </Text>
          )}
          {health.kind === "fail" && (
            <Text style={[styles.status, { color: colors.danger }]}>❌ {health.message}</Text>
          )}
        </View>

        <Pressable style={styles.button} onPress={check}>
          <Text style={styles.buttonText}>Fari check karo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: 20 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 22, elevation: 3 },
  brand: { fontSize: 12, fontWeight: "700", color: colors.primary, letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: "700", color: colors.primaryDark, marginVertical: 6 },
  muted: { fontSize: 12, color: colors.muted },
  statusRow: { marginTop: 18, minHeight: 28, justifyContent: "center" },
  status: { fontSize: 14, fontWeight: "600" },
  button: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: colors.primary, fontSize: 15, fontWeight: "700" },
});
