import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { attachments } from "@/lib/db/schema";
import { buildDocument } from "./document";
import { generateAgreementPdf, type GeneratedPdf } from "./pdf";
import { attachmentInfos, versionData, type AgreementRow, type VersionRow } from "./repo";
import { getFile } from "./storage";

/** Renders one agreement version to PDF, merging any PDF/image exhibits. `draft` adds the DRAFT marking. */
export async function renderVersionPdf(db: DB, agreement: Pick<AgreementRow, "id">, version: VersionRow, draft: boolean): Promise<GeneratedPdf> {
  const infos = attachmentInfos(db, version.attachmentRefs);
  const doc = buildDocument({ agreementId: agreement.id, versionNo: version.versionNo, data: versionData(version), snapshot: version.templateSnapshot, attachments: infos, draft });
  const files = infos
    .filter((i) => i.mergeable)
    .map((i) => {
      const row = db.select().from(attachments).where(eq(attachments.id, i.id)).get();
      return row ? { id: i.id, fileName: i.fileName, contentType: i.contentType, bytes: getFile(row.storageKey) } : null;
    })
    .filter((f): f is NonNullable<typeof f> => !!f);
  return generateAgreementPdf(doc, files);
}
