import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getOfflineDrafts, removeOfflineDraft, syncOfflineDrafts, OfflineDraftInvoice } from "../offline";
import { colors } from "../theme";

interface Props {
  navigation: any;
}

export default function OfflineDraftsScreen({ navigation }: Props) {
  const [drafts, setDrafts] = useState<OfflineDraftInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = async () => {
    setLoading(true);
    const list = await getOfflineDrafts();
    setDrafts(list);
    setLoading(false);
  };

  const handleSyncAll = async () => {
    if (drafts.length === 0) return;
    setSyncing(true);
    const res = await syncOfflineDrafts();
    setSyncing(false);
    loadDrafts();

    if (res.failed === 0) {
      Alert.alert("સફળતા! 🎉", `તમામ ${res.synced} બિલો સફળતાપૂર્વક સર્વર સાથે સિંક થઈ ગયા!`);
    } else {
      Alert.alert(
        "આંશિક સિંક",
        `${res.synced} બિલો સિંક થયા. ${res.failed} બિલોમાં ઇન્ટરનેટ કે સર્વર એરર આવી.`
      );
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert("પુષ્ટિ કરો", "આ ઓફલાઇન ડ્રાફ્ટ ડિલીટ કરવો છે?", [
      { text: "રદ કરો", style: "cancel" },
      {
        text: "ડિલીટ",
        style: "destructive",
        onPress: async () => {
          await removeOfflineDraft(id);
          loadDrafts();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા</Text>
        </TouchableOpacity>
        <Text style={styles.title}>ઑફલાઇન બિલો (Saved Drafts)</Text>
      </View>

      {/* Sync Banner */}
      <View style={styles.banner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>📶 નેટ વગર સેવ થયેલા બિલો ({drafts.length})</Text>
          <Text style={styles.bannerSub}>જ્યારે મોબાઇલ ડેટા કે વાઇફાઇ ચાલુ હોય ત્યારે સિંક કરો</Text>
        </View>
        <TouchableOpacity
          style={[styles.syncBtn, (syncing || drafts.length === 0) && { opacity: 0.5 }]}
          onPress={handleSyncAll}
          disabled={syncing || drafts.length === 0}
        >
          {syncing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.syncText}>સિંક કરો ⚡</Text>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 14 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.custName}>{item.customerName}</Text>
                <Text style={styles.date}>
                  🕒 {new Date(item.createdAt).toLocaleTimeString("en-IN")} • {item.payload.items.length} વસ્તુઓ
                </Text>
                {item.syncStatus === "failed" && (
                  <Text style={styles.errorText}>⚠️ સિંક નિષ્ફળ: {item.lastError}</Text>
                )}
              </View>

              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.amount}>₹ {item.totalAmount.toFixed(2)}</Text>
                <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.delBtn}>
                  <Text style={styles.delText}>ડિલીટ ✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>કોઈ પેન્ડિંગ ઓફલાઇન બિલ નથી. તમામ સિંક થયેલા છે! ✓</Text>
          }
        />
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
  backBtn: { marginRight: 12 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    padding: 14,
    margin: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  bannerTitle: { fontSize: 13, fontWeight: "800", color: "#92400E" },
  bannerSub: { fontSize: 11, color: "#B45309", marginTop: 2 },
  syncBtn: {
    backgroundColor: "#047857",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginLeft: 8,
  },
  syncText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    elevation: 1,
  },
  custName: { fontSize: 15, fontWeight: "700", color: "#1E293B" },
  date: { fontSize: 11, color: "#64748B", marginTop: 3 },
  amount: { fontSize: 17, fontWeight: "900", color: "#047857" },
  delBtn: { marginTop: 4, paddingVertical: 2 },
  delText: { color: "#EF4444", fontSize: 11, fontWeight: "600" },
  errorText: { color: "#DC2626", fontSize: 11, fontWeight: "700", marginTop: 3 },
  emptyText: { textAlign: "center", color: "#94A3B8", marginTop: 40, fontSize: 13 },
});