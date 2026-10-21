import { Pressable, StyleSheet, Text, View } from "react-native";
import { Me } from "../api";

export default function HomeScreen({ me, onLogout }: { me: Me; onLogout: () => void }) {
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Namaste, {me.full_name} 👋</Text>
        <Text style={styles.line}>Email: {me.email}</Text>
        <Text style={styles.line}>Role: {me.role}</Text>

        {!me.setup_completed && (
          <Text style={styles.warn}>
            Business setup pooru nathi. Pehla web (laptop) par Setup Wizard pooru karo.
          </Text>
        )}

        <Text style={styles.note}>Dashboard ane billing next steps ma aavshe.</Text>

        <Pressable style={styles.button} onPress={onLogout}>
          <Text style={styles.buttonText}>Logout</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ecfdf5", justifyContent: "center", padding: 20 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 22, elevation: 3 },
  title: { fontSize: 22, fontWeight: "700", color: "#065f46", marginBottom: 10 },
  line: { fontSize: 15, color: "#374151", marginTop: 4 },
  warn: {
    marginTop: 14,
    backgroundColor: "#fffbeb",
    color: "#92400e",
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
  },
  note: { marginTop: 14, fontSize: 13, color: "#6b7280" },
  button: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#047857",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: "#047857", fontSize: 15, fontWeight: "700" },
});
