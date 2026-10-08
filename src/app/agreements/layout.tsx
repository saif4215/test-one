import type { Metadata } from "next";
import { Chrome } from "@/components/agreements/Chrome";
import { currentUser } from "@/lib/agreements/session";

export const metadata: Metadata = {
  title: "Maruf Cafe — Purchase Agreements",
  description: "Prepare, review, and e-sign the Maruf Cafe business purchase agreement.",
  robots: { index: false, follow: false },
};

export default async function AgreementsLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return <Chrome user={user}>{children}</Chrome>;
}
