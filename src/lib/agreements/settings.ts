import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { appConfig } from "@/lib/db/schema";

export interface AgreementSettings {
  defaultExpiryDays: number;
  reminderAfterDays: number;
  /** Advisory only: the app never deletes signed agreements or audit records automatically. */
  retentionYears: number;
}

export const DEFAULT_SETTINGS: AgreementSettings = { defaultExpiryDays: 14, reminderAfterDays: 3, retentionYears: 7 };

export function getSettings(db: DB): AgreementSettings {
  const row = db.select().from(appConfig).where(eq(appConfig.key, "agreements")).get();
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<AgreementSettings> | undefined) ?? {}) };
}

export function saveSettings(db: DB, s: AgreementSettings, now = new Date()): string | null {
  if (!(s.defaultExpiryDays >= 1 && s.defaultExpiryDays <= 60)) return "Default expiry must be between 1 and 60 days.";
  if (!(s.reminderAfterDays >= 1 && s.reminderAfterDays <= 30)) return "Reminders must be between 1 and 30 days.";
  if (!(s.retentionYears >= 1 && s.retentionYears <= 50)) return "Retention must be between 1 and 50 years.";
  db.insert(appConfig).values({ key: "agreements", value: s, updatedAt: now.toISOString() }).onConflictDoUpdate({ target: appConfig.key, set: { value: s, updatedAt: now.toISOString() } }).run();
  return null;
}
