/**
 * Reads integration settings from the environment. Secrets stay on the server;
 * these helpers only report whether something is configured, never its value.
 */

export function appUrl(env: NodeJS.ProcessEnv = process.env): string {
  const u = env.APP_URL?.trim().replace(/\/+$/, "");
  if (u) return u;
  if (env.NODE_ENV === "production") throw new Error("APP_URL must be set in production so links in emails point at your site.");
  return "http://localhost:3000";
}

export interface DocuSignConfig {
  environment: "demo" | "production";
  integrationKey: string;
  userId: string;
  accountId: string;
  privateKey: string;
  connectSecret: string;
  baseUri?: string;
}

export function docusignConfig(env: NodeJS.ProcessEnv = process.env): { ok: true; config: DocuSignConfig } | { ok: false; missing: string[] } {
  const need = ["DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_USER_ID", "DOCUSIGN_ACCOUNT_ID", "DOCUSIGN_PRIVATE_KEY", "DOCUSIGN_CONNECT_HMAC_SECRET"];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    config: {
      environment: env.DOCUSIGN_ENV === "production" ? "production" : "demo",
      integrationKey: env.DOCUSIGN_INTEGRATION_KEY!,
      userId: env.DOCUSIGN_USER_ID!,
      accountId: env.DOCUSIGN_ACCOUNT_ID!,
      privateKey: env.DOCUSIGN_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      connectSecret: env.DOCUSIGN_CONNECT_HMAC_SECRET!,
      baseUri: env.DOCUSIGN_BASE_URI || undefined,
    },
  };
}

export interface ResendConfig {
  apiKey: string;
  from: string;
  webhookSecret?: string;
}

export function resendConfig(env: NodeJS.ProcessEnv = process.env): { ok: true; config: ResendConfig } | { ok: false; missing: string[] } {
  const need = ["RESEND_API_KEY", "EMAIL_FROM"];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) return { ok: false, missing };
  return { ok: true, config: { apiKey: env.RESEND_API_KEY!, from: env.EMAIL_FROM!, webhookSecret: env.RESEND_WEBHOOK_SECRET || undefined } };
}

/** What the admin settings page shows. Never includes secret values. */
export function integrationStatus(env: NodeJS.ProcessEnv = process.env) {
  const ds = docusignConfig(env);
  const rs = resendConfig(env);
  let appUrlOk = true;
  try {
    appUrl(env);
  } catch {
    appUrlOk = false;
  }
  return {
    signature: { provider: "DocuSign", configured: ds.ok, missing: ds.ok ? [] : ds.missing, environment: ds.ok ? ds.config.environment : (env.DOCUSIGN_ENV === "production" ? "production" : "demo") },
    email: { provider: "Resend", configured: rs.ok, missing: rs.ok ? [] : rs.missing, webhookSecretSet: !!env.RESEND_WEBHOOK_SECRET },
    appUrlOk,
    appSecretOk: (() => {
      const s = env.APP_SECRET || env.APP_PASSWORD;
      return !!s && s.length >= 16;
    })(),
    fileEncryption: env.FILE_ENCRYPTION_KEY ? "enabled" : "disabled",
  } as const;
}
