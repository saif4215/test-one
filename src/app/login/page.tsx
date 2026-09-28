import { loginAction } from "@/app/actions/auth";
import { Notice } from "@/components/ui";
import { appPassword, safeNextPath } from "@/lib/auth/session";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : "/");
  const enabled = !!appPassword();
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Amazon Reselling AI</h1>
      {!enabled ? (
        <div className="mt-4">
          <Notice tone="info">
            No password is set, so the app is open. Set <code>APP_PASSWORD</code> to require a login (recommended when it&apos;s online).
          </Notice>
        </div>
      ) : (
        <form action={loginAction} className="mt-6 space-y-4 rounded-lg border border-border bg-surface p-5">
          {sp.error && <Notice tone="bad">That password isn&apos;t right.</Notice>}
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm" htmlFor="password">
            <span className="mb-1 block font-medium">Password</span>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="input" autoFocus />
          </label>
          <button className="btn w-full justify-center" type="submit">Sign in</button>
        </form>
      )}
    </div>
  );
}
