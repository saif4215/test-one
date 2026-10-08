/**
 * Small security helpers for the agreements module: tokens, hashes, password
 * hashing, authenticated encryption for stored files, and a rate limiter.
 * Everything uses Node's built-in crypto; nothing here talks to the network.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt as scryptCb,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

export const newId = (): string => randomUUID();

/** URL-safe random token. 32 bytes = 256 bits, so links cannot be guessed. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hmacHex(key: string | Buffer, data: string | Uint8Array): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

export function safeEqualStr(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** 6-digit one-time code (cryptographically random, leading zeros kept). */
export function randomCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Secret used to key short-lived hashes (one-time codes). Falls back to a per-process value only outside production. */
export function appSecret(env: NodeJS.ProcessEnv = process.env): string {
  const s = env.APP_SECRET || env.APP_PASSWORD;
  if (s && s.length >= 16) return s;
  if (env.NODE_ENV === "production") {
    throw new Error("APP_SECRET (at least 16 characters) must be set in production.");
  }
  return "development-only-secret-not-for-production";
}

/* ---- passwords ---- */

export const MIN_PASSWORD_LENGTH = 12;

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw.length > 200) return "That password is too long.";
  if (/^(.)\1+$/.test(pw)) return "Choose a less repetitive password.";
  return null;
}

// Lower cost only under the test runner so the suite stays fast; the cost is stored in each hash.
const SCRYPT = { N: process.env.NODE_ENV === "test" || process.env.VITEST ? 1 << 10 : 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

/** Format: scrypt$N$r$p$salt$hash (base64url). Plaintext passwords are never stored. */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  if (!stored) {
    // Spend comparable time so account existence is not revealed by timing.
    scryptSync(pw, Buffer.alloc(16), 64, SCRYPT);
    return false;
  }
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(pw, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ---- encryption at rest for stored files ---- */

const MAGIC = Buffer.from("MCE1");

export function fileEncryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env.FILE_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("FILE_ENCRYPTION_KEY must be 32 random bytes, base64-encoded.");
  return key;
}

/** AES-256-GCM. Output: "MCE1" | iv(12) | tag(16) | ciphertext. Returns plaintext unchanged when no key is configured. */
export function encryptBytes(plain: Buffer, key: Buffer | null): Buffer {
  if (!key) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decryptBytes(stored: Buffer, key: Buffer | null): Buffer {
  if (stored.length >= 4 + 12 + 16 && stored.subarray(0, 4).equals(MAGIC)) {
    if (!key) throw new Error("This file is encrypted but FILE_ENCRYPTION_KEY is not set.");
    const decipher = createDecipheriv("aes-256-gcm", key, stored.subarray(4, 16));
    decipher.setAuthTag(stored.subarray(16, 32));
    return Buffer.concat([decipher.update(stored.subarray(32)), decipher.final()]);
  }
  return stored;
}

/* ---- rate limiting (in-memory; fine for the single-instance SQLite deployment) ---- */

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  return b.count <= limit ? { ok: true, retryAfterSec: 0 } : { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
}

export function resetRateLimits(): void {
  buckets.clear();
}
