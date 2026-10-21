import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { ApiError, getMe, logout, Me } from "./src/api";
import { clearTokens, getAccess } from "./src/storage";
import HomeScreen from "./src/screens/HomeScreen";
import LoginScreen from "./src/screens/LoginScreen";

type State = { kind: "loading" } | { kind: "login" } | { kind: "home"; me: Me } | { kind: "error"; msg: string };

export default function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const bootstrap = useCallback(async () => {
    setState({ kind: "loading" });
    if (!(await getAccess())) return setState({ kind: "login" });
    try {
      setState({ kind: "home", me: await getMe() });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await clearTokens();
        return setState({ kind: "login" });
      }
      setState({ kind: "error", msg: e instanceof Error ? e.message : "Error" });
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  async function handleLogout() {
    await logout();
    setState({ kind: "login" });
  }

  return (
    <>
      <StatusBar style="dark" />
      {state.kind === "loading" && (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#047857" />
        </View>
      )}
      {state.kind === "login" && <LoginScreen onLoggedIn={bootstrap} />}
      {state.kind === "home" && <HomeScreen me={state.me} onLogout={handleLogout} />}
      {state.kind === "error" && (
        <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
          <Text style={{ color: "#b91c1c", marginBottom: 12 }}>{state.msg}</Text>
          <Text onPress={bootstrap} style={{ color: "#047857", fontWeight: "700" }}>
            Fari try karo
          </Text>
        </View>
      )}
    </>
  );
}
