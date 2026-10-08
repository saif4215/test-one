import { and, eq } from "drizzle-orm";
import { recordEvent } from "@/lib/agreements/audit";
import { renderVersionPdf } from "@/lib/agreements/pdfService";
import { accessLevel, getAgreementRow, readAttachment } from "@/lib/agreements/repo";
import { rateLimit } from "@/lib/agreements/security";
import { actorFor, currentUser } from "@/lib/agreements/session";
import { currentSigners } from "@/lib/agreements/signing";
import { getDb } from "@/lib/db/client";
import { agreementVersions, attachments } from "@/lib/db/schema";

const pdfResponse = (bytes: Uint8Array, name: string, inline: boolean) =>
  new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

/**
 * Authenticated PDF access. `draft` is generated on demand and clearly marked as a draft;
 * `signed` and `certificate` are only ever the files the signature provider returned, and
 * simply don't exist (404) until completion has been verified.
 */
export async function GET(req: Request, ctx: RouteContext<"/agreements/[id]/pdf">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const actor = actorFor(user);
  const db = getDb();
  if (!accessLevel(db, actor, id)) return new Response("Not found", { status: 404 });
  const agreement = getAgreementRow(db, id)!;
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "draft";
  const inline = url.searchParams.get("inline") === "1";

  if (kind === "signed" || kind === "certificate") {
    const req2 = currentSigners(db, id).request;
    const completed = req2 && req2.status === "completed" ? req2 : null;
    const attId = kind === "signed" ? completed?.signedAttachmentId : completed?.certificateAttachmentId;
    const file = attId ? readAttachment(db, actor, id, attId) : null;
    if (!file) return new Response(kind === "signed" ? "The signed agreement isn't available (yet)." : "No certificate is available.", { status: 404 });
    recordEvent(db, { agreementId: id, versionId: completed!.versionId, type: "pdf.downloaded", actorType: "user", actorRef: user.id, metadata: { kind, sha256: file.row.sha256 } });
    return pdfResponse(file.bytes, file.row.fileName, inline);
  }

  if (kind === "sent") {
    const v = Number(url.searchParams.get("version") ?? agreement.currentVersionNo);
    const ver = db.select().from(agreementVersions).where(and(eq(agreementVersions.agreementId, id), eq(agreementVersions.versionNo, v))).get();
    const att = ver ? db.select().from(attachments).where(and(eq(attachments.agreementId, id), eq(attachments.versionId, ver.id), eq(attachments.kind, "sent_pdf"))).get() : null;
    const file = att ? readAttachment(db, actor, id, att.id) : null;
    if (!file) return new Response("Not found", { status: 404 });
    return pdfResponse(file.bytes, file.row.fileName, inline);
  }

  if (!rateLimit(`pdf:${user.id}`, 30, 60_000).ok) return new Response("Too many requests", { status: 429 });
  const v = Number(url.searchParams.get("version") ?? agreement.currentVersionNo);
  const ver = db.select().from(agreementVersions).where(and(eq(agreementVersions.agreementId, id), eq(agreementVersions.versionNo, v))).get();
  if (!ver) return new Response("Not found", { status: 404 });
  const pdf = await renderVersionPdf(db, agreement, ver, true);
  recordEvent(db, { agreementId: id, versionId: ver.id, type: "pdf.generated", actorType: "user", actorRef: user.id, metadata: { kind: "draft", pages: pdf.pageCount, mergeFailures: pdf.mergeFailures.length } });
  return pdfResponse(pdf.bytes, `${id}-v${ver.versionNo}-DRAFT.pdf`, inline);
}
