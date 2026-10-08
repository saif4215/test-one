import { getDb, type DB } from "@/lib/db/client";
import { appUrl } from "./config";
import { ResendMailer, type Mailer } from "./email/mailer";
import { DocuSignProvider } from "./providers/docusign";
import type { SignatureProvider } from "./providers/types";

/** Everything the workflow needs from the outside world. Tests pass fakes; production uses the real services. */
export interface Deps {
  db: DB;
  provider: SignatureProvider;
  mailer: Mailer;
  baseUrl: string;
  now: () => Date;
}

const g = globalThis as unknown as { __agreementProvider?: SignatureProvider; __agreementMailer?: Mailer };

export function defaultDeps(db: DB = getDb()): Deps {
  g.__agreementProvider ??= new DocuSignProvider();
  g.__agreementMailer ??= new ResendMailer();
  return { db, provider: g.__agreementProvider, mailer: g.__agreementMailer, baseUrl: appUrl(), now: () => new Date() };
}
