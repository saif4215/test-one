/**
 * Google service-account authentication (OAuth 2.0 JWT bearer flow), using
 * node:crypto only. Credentials come from environment variables and are
 * never logged or sent anywhere except Google's token endpoint.
 *
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   e.g. reseller@my-project.iam.gserviceaccount.com
 *   GOOGLE_PRIVATE_KEY             the service account's PEM private key (\n escapes are fine)
 */
import { createSign } from "node:crypto";

export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export interface ServiceAccount {
  email: string;
  privateKey: string;
}

export function readServiceAccount(env: NodeJS.ProcessEnv = process.env): ServiceAccount | null {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) return null;
  return { email, privateKey: key.replace(/\\n/g, "\n") };
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** Signed RS256 JWT assertion for the token endpoint. Valid for one hour. */
export function signJwt(sa: ServiceAccount, scope: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.email, scope, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(sa.privateKey))}`;
}

const cache = new Map<string, { token: string; expiresAt: number }>();

export async function getAccessToken(sa: ServiceAccount, scope: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const key = `${sa.email}|${scope}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signJwt(sa, scope) }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !body.access_token) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error ?? res.statusText}`);
  cache.set(key, { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

export function clearTokenCache() {
  cache.clear();
}
