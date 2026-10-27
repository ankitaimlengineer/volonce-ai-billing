import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // 🚀 પ્રોડક્શન ડોકર ઈમેજને સુપર લાઈટવેઇટ અને ફાસ્ટ બનાવે છે
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;