import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { getMe, logout, Me, Customer } from "./src/api";
import { getAccess } from "./src/storage";
import { colors } from "./src/theme";

// તમામ સ્ક્રીન્સ
import LoginScreen from "./src/screens/LoginScreen";
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
      {!user ? (
        <LoginScreen onLoggedIn={checkAuth} />
      ) : (
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