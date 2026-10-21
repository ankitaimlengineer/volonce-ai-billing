import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getProducts, Product } from "../api";
import { colors } from "../theme";

interface ProductsScreenProps {
  onBack: () => void;
}

export default function ProductsScreen({ onBack }: ProductsScreenProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await getProducts();
      const list = Array.isArray(res) ? res : res.items || [];
      setProducts(list);
    } catch (err) {
      console.log("Products fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← પાછા જાઓ</Text>
        </TouchableOpacity>
        <Text style={styles.title}>પ્રોડક્ટ્સ અને સ્ટોક</Text>
      </View>

      {/* Search Input */}
      <View style={styles.searchBox}>
        <TextInput
          placeholder="પ્રોડક્ટનું નામ અથવા SKU શોધો..."
          value={search}
          onChangeText={setSearch}
          style={styles.input}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={styles.itemCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemSku}>SKU: {item.sku || "N/A"}</Text>
                <Text style={styles.itemPrice}>વેચાણ કિંમત: ₹{item.selling_price}</Text>
              </View>
              <View style={styles.stockBadge}>
                <Text style={styles.stockText}>સ્ટોક: {item.current_stock ?? "N/A"}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>કોઈ પ્રોડક્ટ મળી નથી</Text>
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
  backBtn: { marginRight: 14 },
  backText: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
  searchBox: { padding: 14, backgroundColor: "#FFFFFF" },
  input: {
    backgroundColor: "#F1F5F9",
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
  },
  itemCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    alignItems: "center",
    elevation: 1,
  },
  itemName: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  itemSku: { fontSize: 12, color: "#64748B", marginTop: 2 },
  itemPrice: { fontSize: 14, fontWeight: "600", color: "#10B981", marginTop: 4 },
  stockBadge: {
    backgroundColor: "#EFF6FF",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  stockText: { color: "#2563EB", fontWeight: "700", fontSize: 13 },
  emptyText: { textAlign: "center", marginTop: 40, color: "#94A3B8" },
});