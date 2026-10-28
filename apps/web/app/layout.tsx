import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "VOLONCE AI BILLING",
  description: "Billing, inventory and accounting for your business",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="gu">
      <body className="antialiased">
        <LanguageProvider>
          {/* 🚀 સમગ્ર વેબ એપમાં ઓનર અને કેશિયરના રોલ કન્ટ્રોલ માટે AuthProvider */}
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}