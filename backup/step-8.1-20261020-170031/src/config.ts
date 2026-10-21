// Single place for runtime configuration. Values come from apps/mobile/.env
// (EXPO_PUBLIC_* variables are embedded in the app bundle, so NEVER put secrets here).
export const API_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.1.10:8000"
).replace(/\/+$/, "");

export const API_PREFIX = "/api/v1";
