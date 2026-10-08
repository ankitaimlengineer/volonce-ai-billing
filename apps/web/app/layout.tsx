import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}