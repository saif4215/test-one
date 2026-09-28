/**
 * Runs the Daily Deal Finder from an external scheduler (Render Cron Job,
 * cron-job.org, GitHub Actions, …):
 *
 *   curl -X POST https://your-app/api/deal-finder -H "Authorization: Bearer $CRON_SECRET"
 *
 * Disabled unless CRON_SECRET is set.
 */
import { runDealFinder } from "@/lib/alerts/dealFinder";
import { safeEqual } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Set CRON_SECRET to enable this endpoint." }, { status: 404 });
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const r = runDealFinder(getDb());
  return Response.json(r);
}
