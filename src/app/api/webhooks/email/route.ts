import { defaultDeps } from "@/lib/agreements/deps";
import { rateLimit } from "@/lib/agreements/security";
import { handleEmailWebhook } from "@/lib/agreements/webhooks";

/** Email delivery events (Resend, signed with Svix). */
export async function POST(req: Request) {
  if (!rateLimit("webhook-email", 600, 60_000).ok) return new Response("rate limited", { status: 429 });
  const raw = await req.text();
  if (raw.length > 500_000) return new Response("too large", { status: 413 });
  const out = await handleEmailWebhook(defaultDeps(), raw, req.headers);
  return new Response(out.body, { status: out.status });
}
