import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { attachments } from "@/lib/db/schema";
import { getSignerCookie } from "@/lib/agreements/session";
import { resolveToken, signerSessionValid } from "@/lib/agreements/signing";
import { getFile } from "@/lib/agreements/storage";

/** A signer's authenticated download: the document they're signing, or (after completion) the signed copy and certificate. */
export async function GET(req: Request, ctx: RouteContext<"/sign/[token]/pdf">) {
  const { token } = await ctx.params;
  const db = getDb();
  const view = resolveToken(db, token);
  if (view.state !== "ok" || !view.sig || !view.request) return new Response("Not found", { status: 404 });
  if (!signerSessionValid(view.sig, await getSignerCookie())) return new Response("Verify your email first", { status: 401 });
  const kind = new URL(req.url).searchParams.get("kind") ?? "sent";
  let id: string | null | undefined;
  if (kind === "signed" && view.request.status === "completed") id = view.request.signedAttachmentId;
  else if (kind === "certificate" && view.request.status === "completed") id = view.request.certificateAttachmentId;
  else if (kind === "sent") {
    id = db.select().from(attachments).where(eq(attachments.versionId, view.request.versionId)).all().find((a) => a.kind === "sent_pdf")?.id;
  }
  const row = id ? db.select().from(attachments).where(eq(attachments.id, id)).get() : null;
  if (!row || row.agreementId !== view.request.agreementId) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(getFile(row.storageKey)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${row.fileName.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
