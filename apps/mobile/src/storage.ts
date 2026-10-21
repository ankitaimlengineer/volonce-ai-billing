import * as SecureStore from "expo-secure-store";

// Tokens live in the phone's secure storage (Keychain / Keystore), not in plain storage
const ACCESS = "access_token";
const REFRESH = "refresh_token";

export async function saveTokens(access: string, refresh: string) {
  await SecureStore.setItemAsync(ACCESS, access);
  await SecureStore.setItemAsync(REFRESH, refresh);
}

export const getAccess = () => SecureStore.getItemAsync(ACCESS);
export const getRefresh = () => SecureStore.getItemAsync(REFRESH);

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS);
  await SecureStore.deleteItemAsync(REFRESH);
}
