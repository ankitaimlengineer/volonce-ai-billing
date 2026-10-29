import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { getMe, logout, Me, Customer } from "./src/api";
import { getAccess } from "./src/storage";
import { colors } from "./src/theme";

// તમામ સ્ક્રીન્સ (ઓથેન્ટિકેશન & સેટઅપ)
import LoginScreen from "./src/screens/LoginScreen";
import BusinessSetupScreen from "./src/screens/BusinessSetupScreen";

// મુખ્ય બિલિંગ અને એકાઉન્ટિંગ સ્ક્રીન્સ
import HomeScreen from "./src/screens/HomeScreen";
import ProductsScreen from "./src/screens/ProductsScreen";
import BillingScreen from "./src/screens/BillingScreen";
import AiCameraBillingScreen from "./src/screens/AiCameraBillingScreen";
import CustomersScreen from "./src/screens/CustomersScreen";
import CustomerLedgerScreen from "./src/screens/CustomerLedgerScreen";
import ExpensesScreen from "./src/screens/ExpensesScreen";
import SuppliersScreen from "./src/screens/SuppliersScreen";
import PurchasesScreen from "./src/screens/PurchasesScreen";
import OfflineDraftsScreen from "./src/screens/OfflineDraftsScreen";

// 🚀 વેબ જેવા જ ૧૦૦% સમાન નવા ફીચર્સ
import InvoicesScreen from "./src/screens/InvoicesScreen";
import ReportsScreen from "./src/screens/ReportsScreen";
import SubscriptionScreen from "./src/screens/SubscriptionScreen";
import StockTransfersScreen from "./src/screens/StockTransfersScreen";

export type RootStackParamList = {
  Home: undefined;
  Products: undefined;
  Billing: undefined;
  AiCamera: undefined;
  Customers: undefined;
  CustomerLedger: { customer: Customer };
  Expenses: undefined;
  Suppliers: undefined;
  Purchases: undefined;
  OfflineDrafts: undefined;
  Invoices: undefined;        // 👈 ૧૧. બિલોનો ઇતિહાસ
  Reports: undefined;         // 👈 ૧૨. નાણાકીય રિપોર્ટ્સ (P&L, Sales, Cashflow)
  Subscription: undefined;    // 👈 ૧૩. સબસ્ક્રિપ્શન અને કૂપન રિડીમ
  StockTransfers: undefined;  // 👈 ૧૪. ગોડાઉન સ્ટોક ટ્રાન્સફર
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Me | null>(null);

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
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />

      {/* ૧. જો યુઝર લૉગિન ન હોય તો Login / Register સ્ક્રીન બતાવો */}
      {!user ? (
        <LoginScreen onLoggedIn={checkAuth} />
      ) : !user.setup_completed ? (
        /* ૨. જો નવો યુઝર રજીસ્ટર થયો હોય પણ સેટઅપ બાકી હોય, તો ૩-સ્ટેપ સેટઅપ વિઝાર્ડ બતાવો */
        <BusinessSetupScreen
          user={user}
          onComplete={checkAuth}
          onLogout={handleLogout}
        />
      ) : (
        /* ૩. સેટઅપ કમ્પ્લીટ હોય તો જ મુખ્ય નેવિગેટર અને ડેશબોર્ડ ખુલશે */
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{
              headerShown: false,
              animation: "slide_from_right",
            }}
          >
            {/* ૧. હોમ સ્ક્રીન (ડેશબોર્ડ & શોર્ટકટ્સ) */}
            <Stack.Screen name="Home">
              {(props) => (
                <HomeScreen
                  {...props}
                  user={user}
                  onLogout={handleLogout}
                />
              )}
            </Stack.Screen>

            {/* ૨. પ્રોડક્ટ્સ અને સ્ટોક સ્ક્રીન */}
            <Stack.Screen name="Products">
              {(props) => (
                <ProductsScreen
                  {...props}
                  onBack={() => props.navigation.goBack()}
                />
              )}
            </Stack.Screen>

            {/* ૩. સાદું POS બિલિંગ સ્ક્રીન */}
            <Stack.Screen name="Billing">
              {(props) => (
                <BillingScreen
                  {...props}
                  onBack={() => props.navigation.goBack()}
                />
              )}
            </Stack.Screen>

            {/* ૪. AI કેમેરા સ્કેન બિલિંગ સ્ક્રીન */}
            <Stack.Screen name="AiCamera">
              {(props) => (
                <AiCameraBillingScreen
                  {...props}
                  onBack={() => props.navigation.goBack()}
                />
              )}
            </Stack.Screen>

            {/* ૫. ગ્રાહકો અને ઉધારી લિસ્ટ સ્ક્રીન */}
            <Stack.Screen name="Customers">
              {(props) => (
                <CustomersScreen
                  {...props}
                  onBack={() => props.navigation.goBack()}
                  onSelectCustomer={(c) =>
                    props.navigation.navigate("CustomerLedger", { customer: c })
                  }
                />
              )}
            </Stack.Screen>

            {/* ૬. ગ્રાહકની વ્યક્તિગત ખાતાવહી (Ledger) સ્ક્રીન */}
            <Stack.Screen name="CustomerLedger">
              {(props) => (
                <CustomerLedgerScreen
                  {...props}
                  customer={props.route.params.customer}
                  onBack={() => props.navigation.goBack()}
                />
              )}
            </Stack.Screen>

            {/* ૭. દુકાનના ખર્ચા (Expenses) સ્ક્રીન */}
            <Stack.Screen name="Expenses">
              {(props) => (
                <ExpensesScreen
                  {...props}
                  onBack={() => props.navigation.goBack()}
                />
              )}
            </Stack.Screen>

            {/* ૮. વેપારીઓ અને પેમેન્ટ (Suppliers) સ્ક્રીન */}
            <Stack.Screen name="Suppliers" component={SuppliersScreen} />

            {/* ૯. માલની ખરીદી (Purchases) સ્ક્રીન */}
            <Stack.Screen name="Purchases" component={PurchasesScreen} />

            {/* ૧૦. ઓફલાઇન બિલો (Offline Drafts) સ્ક્રીન */}
            <Stack.Screen name="OfflineDrafts" component={OfflineDraftsScreen} />

            {/* ---------------- 🚀 વેબ જેવા જ ૧૦૦% સેમ નવા મોડ્યુલ્સ ---------------- */}
            {/* ૧૧. બિલોનો ઇતિહાસ & રીપ્રિન્ટ (Invoices History) */}
            <Stack.Screen name="Invoices" component={InvoicesScreen} />

            {/* ૧૨. નાણાકીય રિપોર્ટ્સ (P&L, Sales & Cash Flow) */}
            <Stack.Screen name="Reports" component={ReportsScreen} />

            {/* ૧૩. સબસ્ક્રિપ્શન અને કૂપન કોડ (Subscription & Vouchers) */}
            <Stack.Screen name="Subscription" component={SubscriptionScreen} />

            {/* ૧૪. ગોડાઉન સ્ટોક ટ્રાન્સફર (Stock Transfers) */}
            <Stack.Screen name="StockTransfers" component={StockTransfersScreen} />
          </Stack.Navigator>
        </NavigationContainer>
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