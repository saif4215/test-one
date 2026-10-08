/**
 * Creates (or resets) an administrator account for the purchase-agreement portal.
 *   npm run agreements:admin -- you@example.com "Your Name"
 * The password is read from ADMIN_PASSWORD, or typed at a hidden prompt. It is never stored in plaintext.
 */
import { getDb } from "../src/lib/db/client";
import { bootstrapAdmin } from "../src/lib/agreements/users";
import { ensureTemplate } from "../src/lib/agreements/repo";

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    let value = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\n" || c === "\r" || c === "\u0004") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (c === "\u0003") process.exit(130);
        value = c === "\u007f" ? value.slice(0, -1) : value + c;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  if (!email) {
    console.error('Usage: npm run agreements:admin -- you@example.com "Your Name"');
    process.exit(1);
  }
  const password = process.env.ADMIN_PASSWORD ?? (await askHidden("Password (12+ characters): "));
  const db = getDb();
  ensureTemplate(db);
  const res = await bootstrapAdmin(db, email, nameParts.join(" "), password);
  if (!res.ok) {
    console.error(res.error);
    process.exit(1);
  }
  console.log(`Administrator ready: ${res.value.email}. Sign in at /agreements/login`);
}

main();
