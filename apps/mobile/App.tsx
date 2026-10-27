import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getMe, logout, Me, Customer } from "./src/api";
import { getAccess } from "./src/storage";
import { colors } from "./src/theme";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ProductsScreen from "./src/screens/ProductsScreen";
import BillingScreen from "./src/screens/BillingScreen";
import AiCameraBillingScreen from "./src/screens/AiCameraBillingScreen";
import CustomersScreen from "./src/screens/CustomersScreen";
import CustomerLedgerScreen from "./src/screens/CustomerLedgerScreen";
import ExpensesScreen from "./src/screens/ExpensesScreen";

export type ScreenType =
  | "home"
  | "products"
  | "billing"
  | "ai_camera"
  | "customers"
  | "customer_ledger"
  | "expenses";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Me | null>(null);
  const [currentScreen, setCurrentScreen] = useState<ScreenType>("home");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

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

      {/* ૧. હોમ સ્ક્રીન (ડેશબોર્ડ અને શોર્ટકટ્સ) */}
      {currentScreen === "home" && (
        <HomeScreen
          user={user}
          onLogout={handleLogout}
          navigation={{
            navigate: (screen: string) => {
              if (screen === "Billing") setCurrentScreen("billing");
              if (screen === "AiCamera") setCurrentScreen("ai_camera");
              if (screen === "Products") setCurrentScreen("products");
              if (screen === "Customers") setCurrentScreen("customers");
              if (screen === "Expenses") setCurrentScreen("expenses");
            },
          }}
        />
      )}

      {/* ૨. પ્રોડક્ટ્સ અને સ્ટોક સ્ક્રીન */}
      {currentScreen === "products" && (
        <ProductsScreen onBack={() => setCurrentScreen("home")} />
      )}

      {/* ૩. સાદું POS બિલિંગ સ્ક્રીન */}
      {currentScreen === "billing" && (
        <BillingScreen onBack={() => setCurrentScreen("home")} />
      )}

      {/* ૪. AI કેમેરા સ્કેન બિલિંગ સ્ક્રીન */}
      {currentScreen === "ai_camera" && (
        <AiCameraBillingScreen onBack={() => setCurrentScreen("home")} />
      )}

      {/* ૫. ગ્રાહકો અને ઉધારી લિસ્ટ સ્ક્રીન */}
      {currentScreen === "customers" && (
        <CustomersScreen
          onBack={() => setCurrentScreen("home")}
          onSelectCustomer={(c) => {
            setSelectedCustomer(c);
            setCurrentScreen("customer_ledger");
          }}
        />
      )}

      {/* ૬. ગ્રાહકની વ્યક્તિગત ખાતાવહી (Ledger) અને જમા પેમેન્ટ */}
      {currentScreen === "customer_ledger" && selectedCustomer && (
        <CustomerLedgerScreen
          customer={selectedCustomer}
          onBack={() => setCurrentScreen("customers")}
        />
      )}

      {/* ૭. દુકાનના ખર્ચા (Expenses) સ્ક્રીન */}
      {currentScreen === "expenses" && (
        <ExpensesScreen onBack={() => setCurrentScreen("home")} />
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