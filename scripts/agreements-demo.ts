/**
 * Loads a FICTIONAL sample agreement (every value says SAMPLE) so you can explore the screens.
 * Needs an administrator first: npm run agreements:admin -- admin@example.com "Admin"
 * It does not contact any e-signature or email service and never marks anything signed.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db/client";
import { users } from "../src/lib/db/schema";
import { applyData, completeData } from "../src/lib/agreements/test-helpers";
import { createAgreement, ensureTemplate, submitForReview } from "../src/lib/agreements/repo";

const db = getDb();
ensureTemplate(db);
const admin = db.select().from(users).where(eq(users.role, "admin")).get();
if (!admin) {
  console.error("Create an administrator first: npm run agreements:admin -- you@example.com \"Your Name\"");
  process.exit(1);
}
const actor = { id: admin.id, role: "admin" as const };
const created = createAgreement(db, actor);
if (!created.ok) throw new Error(created.error);
const id = created.value.agreement.id;
applyData(db, actor, id, completeData());
const sub = submitForReview(db, actor, id);
console.log(`Created sample agreement ${id}${sub.ok ? " (submitted for review)" : ""}`);
