import { NextResponse } from "next/server";
import { defaultDeps } from "@/lib/agreements/deps";
import { rateLimit } from "@/lib/agreements/security";
import { reconcileRequest, resolveToken } from "@/lib/agreements/signing";

/**
 * Where the e-signature service sends the signer back. The query string (for example
 * "event=signing_complete") is deliberately ignored: we re-read the real status from the provider.
 */
export async function GET(req: Request, ctx: RouteContext<"/sign/[token]/return">) {
  const { token } = await ctx.params;
  const deps = defaultDeps();
  const view = resolveToken(deps.db, token);
  if (view.state === "ok" && view.request && rateLimit(`return:${view.request.id}`, 20, 60_000).ok) {
    await reconcileRequest(deps, view.request.id, "return");
  }
  const origin = new URL(req.url).origin;
  return NextResponse.redirect(new URL(`/sign/${token}?returned=1`, deps.baseUrl || origin), 303);
}
