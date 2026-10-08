import { defaultDeps } from "@/lib/agreements/deps";
import { rateLimit } from "@/lib/agreements/security";
import { handleSignatureWebhook } from "@/lib/agreements/webhooks";

/** E-signature provider notifications (DocuSign Connect). Authenticated by HMAC signature, never by cookies. */
export async function POST(req: Request) {
  if (!rateLimit("webhook-sig", 600, 60_000).ok) return new Response("rate limited", { status: 429 });
  const raw = await req.text();
  if (raw.length > 2_000_000) return new Response("too large", { status: 413 });
  const out = await handleSignatureWebhook(defaultDeps(), raw, req.headers);
  return new Response(out.body, { status: out.status });
}
