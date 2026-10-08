import { timingSafeEqual } from "node:crypto";
import { defaultDeps } from "@/lib/agreements/deps";
import { runMaintenance } from "@/lib/agreements/signing";
import { getSettings } from "@/lib/agreements/settings";

/**
 * Housekeeping for an external scheduler (cron, Render cron job): expires overdue signature
 * requests, retries failed voids and document retrievals, and sends reminders.
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-site/api/agreements/maintenance
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const ok = !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new Response("Unauthorized", { status: 401 });
  const deps = defaultDeps();
  const result = await runMaintenance(deps, { reminderAfterDays: getSettings(deps.db).reminderAfterDays });
  return Response.json(result);
}
