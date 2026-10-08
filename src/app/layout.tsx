import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { appPassword } from "@/lib/auth/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amazon Reselling AI",
  description:
    "Research, verify, and track Amazon reselling opportunities with transparent calculations and labeled data sources.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const authEnabled = !!appPassword();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <AppShell authEnabled={authEnabled}>{children}</AppShell>
      </body>
    </html>
  );
}
