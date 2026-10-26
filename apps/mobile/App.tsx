import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getMe, logout, Me } from "./src/api";
import { getAccess } from "./src/storage";
import { colors } from "./src/theme";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ProductsScreen from "./src/screens/ProductsScreen";
import BillingScreen from "./src/screens/BillingScreen";
import AiCameraBillingScreen from "./src/screens/AiCameraBillingScreen";

export type ScreenType = "home" | "products" | "billing" | "ai_camera";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Me | null>(null);
  const [currentScreen, setCurrentScreen] = useState<ScreenType>("home");

  const checkAuth = async () => {
    try {
      const token = await getAccess();
      if (token) {
        const me = await getMe();
        setUser(me);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.log("Auth error:", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleLogout = async () => {
    setLoading(true);
    await logout();
    setUser(null);
    setCurrentScreen("home");
    setLoading(false);
  };

  const handleLoginSuccess = async () => {
    setLoading(true);
    await checkAuth();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <LoginScreen onLoggedIn={handleLoginSuccess} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {currentScreen === "home" && (
        <HomeScreen
          user={user}
          onLogout={handleLogout}
          navigation={{
            navigate: (screen: string) => {
              if (screen === "Billing") setCurrentScreen("billing");
              if (screen === "AiCamera") setCurrentScreen("ai_camera");
              if (screen === "Products") setCurrentScreen("products");
            },
          }}
        />
      )}
      {currentScreen === "products" && (
        <ProductsScreen onBack={() => setCurrentScreen("home")} />
      )}
      {currentScreen === "billing" && (
        <BillingScreen onBack={() => setCurrentScreen("home")} />
      )}
      {currentScreen === "ai_camera" && (
        <AiCameraBillingScreen onBack={() => setCurrentScreen("home")} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
});