/**
 * Private file storage. Files live outside `public/`, under random keys, and are
 * only reachable through authenticated route handlers. When FILE_ENCRYPTION_KEY
 * is set they are encrypted with AES-256-GCM before they touch the disk.
 */
import fs from "node:fs";
import path from "node:path";
import { decryptBytes, encryptBytes, fileEncryptionKey, randomToken, sha256Hex } from "./security";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_AGREEMENT = 25;

export function storageDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.UPLOAD_DIR) return env.UPLOAD_DIR;
  const db = env.DATABASE_PATH && env.DATABASE_PATH !== ":memory:" ? path.dirname(env.DATABASE_PATH) : path.join(process.cwd(), "data");
  return path.join(db, "files");
}

export function encryptionStatus(env: NodeJS.ProcessEnv = process.env): "enabled" | "disabled" {
  return env.FILE_ENCRYPTION_KEY ? "enabled" : "disabled";
}

const KEY_RE = /^[A-Za-z0-9_-]{20,64}$/;

function pathFor(key: string, env: NodeJS.ProcessEnv): string {
  if (!KEY_RE.test(key)) throw new Error("Invalid storage reference.");
  return path.join(storageDir(env), key.slice(0, 2), key);
}

/** Writes the bytes and returns an opaque storage key plus the hash of the plaintext. */
export function putFile(data: Buffer, env: NodeJS.ProcessEnv = process.env): { key: string; sha256: string } {
  const encKey = fileEncryptionKey(env);
  if (!encKey && env.NODE_ENV === "production" && env.ALLOW_UNENCRYPTED_STORAGE !== "true") {
    throw new Error("File storage is not configured: set FILE_ENCRYPTION_KEY (see docs/AGREEMENTS.md).");
  }
  const key = randomToken(24);
  const file = pathFor(key, env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, encryptBytes(data, encKey), { mode: 0o600, flag: "wx" });
  return { key, sha256: sha256Hex(data) };
}

export function getFile(key: string, env: NodeJS.ProcessEnv = process.env): Buffer {
  return decryptBytes(fs.readFileSync(pathFor(key, env)), fileEncryptionKey(env));
}

/* ---- upload validation ---- */

interface Kind {
  contentType: string;
  /** Can this type be merged into the signed PDF packet? */
  mergeable: boolean;
}

const KINDS: Record<string, Kind> = {
  pdf: { contentType: "application/pdf", mergeable: true },
  png: { contentType: "image/png", mergeable: true },
  jpg: { contentType: "image/jpeg", mergeable: true },
  jpeg: { contentType: "image/jpeg", mergeable: true },
  docx: { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", mergeable: false },
  xlsx: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", mergeable: false },
  csv: { contentType: "text/csv", mergeable: false },
};

export const ALLOWED_EXTENSIONS = Object.keys(KINDS);

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "").replace(/\s+/g, " ").trim();
  return (cleaned || "file").slice(0, 120);
}

export interface ValidatedUpload {
  fileName: string;
  contentType: string;
  mergeable: boolean;
}

/** Checks extension, size, and the file's real signature; never trusts the browser's MIME type. */
export function validateUpload(fileName: string, data: Buffer): { ok: true; value: ValidatedUpload } | { ok: false; error: string } {
  const name = sanitizeFileName(fileName);
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const kind = KINDS[ext];
  if (!kind) return { ok: false, error: `${name}: file type not allowed. Use ${ALLOWED_EXTENSIONS.join(", ")}.` };
  if (data.length === 0) return { ok: false, error: `${name}: the file is empty.` };
  if (data.length > MAX_UPLOAD_BYTES) return { ok: false, error: `${name}: larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  const head = data.subarray(0, 8);
  const bad = (why: string) => ({ ok: false as const, error: `${name}: ${why}` });
  if (ext === "pdf") {
    if (head.subarray(0, 5).toString("latin1") !== "%PDF-") return bad("not a valid PDF.");
    const text = data.toString("latin1");
    if (/\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction)\b/.test(text)) return bad("PDFs with scripts, launch actions, or embedded files are not accepted.");
  } else if (ext === "png") {
    if (!head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return bad("not a valid PNG image.");
  } else if (ext === "jpg" || ext === "jpeg") {
    if (!(head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)) return bad("not a valid JPEG image.");
  } else if (ext === "docx" || ext === "xlsx") {
    if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) return bad("not a valid Office file.");
  } else if (ext === "csv") {
    if (data.subarray(0, 4096).includes(0)) return bad("not a text CSV file.");
  }
  return { ok: true, value: { fileName: name, contentType: kind.contentType, mergeable: kind.mergeable } };
}
