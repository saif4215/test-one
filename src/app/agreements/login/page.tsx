import { redirect } from "next/navigation";
import { LoginForm } from "@/components/agreements/AuthForms";
import { Notice } from "@/components/ui";
import { currentUser } from "@/lib/agreements/session";

export default async function AgreementsLogin({ searchParams }: PageProps<"/agreements/login">) {
  const sp = await searchParams;
  if (await currentUser()) redirect("/agreements");
  const next = typeof sp.next === "string" && sp.next.startsWith("/agreements") && !sp.next.startsWith("//") ? sp.next : "/agreements";
  return (
    <div className="mx-auto mt-8 max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mb-5 mt-1 text-sm text-muted">Maruf Cafe business purchase agreements</p>
      {sp.activated && (
        <div className="mb-4">
          <Notice tone="good">Your account is ready. Sign in below.</Notice>
        </div>
      )}
      <LoginForm next={next} />
      <p className="mt-4 text-xs text-muted">
        Access is by invitation. If you were asked to sign an agreement, use the private link in your email instead; you don&apos;t need an account.
      </p>
    </div>
  );
}
