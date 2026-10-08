import { SettingsForm } from "@/components/agreements/AdminForms";
import { Card, Notice, PageHeader } from "@/components/ui";
import { integrationStatus } from "@/lib/agreements/config";
import { requireAdmin } from "@/lib/agreements/session";
import { getSettings } from "@/lib/agreements/settings";
import { getDb } from "@/lib/db/client";

function Row({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex flex-wrap items-start gap-2 py-2 text-sm">
      <span className={ok ? "text-good" : "text-bad"} aria-hidden="true">{ok ? "●" : "○"}</span>
      <span className="font-medium">{label}</span>
      <span className="text-muted">{detail}</span>
      <span className="sr-only">{ok ? "configured" : "not configured"}</span>
    </li>
  );
}

export default async function IntegrationsPage() {
  await requireAdmin();
  const s = integrationStatus();
  return (
    <>
      <PageHeader title="Integrations and settings" subtitle="Keys are server environment variables, shown here only as present or missing." />
      <div className="space-y-5">
        <Notice tone="warn" title="Not verified by the app.">“Present” means the settings exist. Whether they actually work is only proven when a real request succeeds; follow the sandbox test checklist in docs/AGREEMENTS.md before sending a real agreement.</Notice>
        <Card title="Connections">
          <ul className="divide-y divide-border">
            <Row ok={s.signature.configured} label={`E-signature: ${s.signature.provider} (${s.signature.environment})`} detail={s.signature.configured ? "credentials present" : `missing ${s.signature.missing.join(", ")}`} />
            <Row ok={s.email.configured} label={`Email: ${s.email.provider}`} detail={s.email.configured ? "API key and sender present" : `missing ${s.email.missing.join(", ")}`} />
            <Row ok={s.email.webhookSecretSet} label="Email delivery webhook" detail={s.email.webhookSecretSet ? "secret present (POST /api/webhooks/email)" : "RESEND_WEBHOOK_SECRET missing, so delivery confirmations can't be received"} />
            <Row ok={s.appUrlOk} label="Public site address (APP_URL)" detail={s.appUrlOk ? "set" : "missing; links in emails can't be built"} />
            <Row ok={s.appSecretOk} label="App secret (APP_SECRET)" detail={s.appSecretOk ? "set" : "missing or shorter than 16 characters"} />
            <Row ok={s.fileEncryption === "enabled"} label="Encryption of stored files (FILE_ENCRYPTION_KEY)" detail={s.fileEncryption === "enabled" ? "AES-256-GCM enabled" : "off; uploads are refused in production unless ALLOW_UNENCRYPTED_STORAGE=true"} />
          </ul>
          <p className="mt-3 text-xs text-muted">E-signature webhook URL to give DocuSign Connect: <code>/api/webhooks/signature</code> (JSON, with HMAC enabled).</p>
        </Card>
        <Card title="Settings">
          <SettingsForm defaults={getSettings(getDb())} />
          <p className="mt-3 text-xs text-muted">Retention is recorded as your policy. The app never deletes signed agreements, signing certificates, or the audit trail automatically.</p>
        </Card>
      </div>
    </>
  );
}
