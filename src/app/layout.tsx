import type { Metadata } from "next";
import { MobileNav, Sidebar } from "@/components/Sidebar";
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
        <div className="flex min-h-screen">
          <Sidebar authEnabled={authEnabled} />
          <div className="min-w-0 flex-1">
            <MobileNav authEnabled={authEnabled} />
            <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
