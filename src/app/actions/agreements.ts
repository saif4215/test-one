"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/agreements/ActionForm";
import { recordEvent } from "@/lib/agreements/audit";
import { defaultDeps } from "@/lib/agreements/deps";
import { notify } from "@/lib/agreements/notify";
import { isRole } from "@/lib/agreements/permissions";
import {
  addAttachment, createAgreement, grantAccess, isEditableStep, removeAttachment, returnToDraft, revokeAccess, saveStep,
  saveTemplate, submitForReview, upgradeToLatestTemplate, caps, type EditableStep,
} from "@/lib/agreements/repo";
import { rateLimit } from "@/lib/agreements/security";
import { actorFor, clientContext, endSession, getSignerCookie, requireAdmin, requireUser, setSessionCookie, setSignerCookie } from "@/lib/agreements/session";
import {
  cancelAgreement, createRevision, declineAsSigner, reconcileRequest, requestIdentityCode, resendInvitation, revokeInvitation,
  sendForSignature, startSigning, verifyIdentityCode, currentSigners, signerSessionValue, type SigningOrder,
} from "@/lib/agreements/signing";
import { getSettings, saveSettings } from "@/lib/agreements/settings";
import { STEPS } from "@/lib/agreements/steps";
import { acceptInvite, bootstrapFromEnv, changePassword, countActiveAdmins, getUser, inviteUser, login, setUserDisabled, setUserRole } from "@/lib/agreements/users";
import { CLAUSES } from "@/lib/agreements/template";
import { SESSION_COOKIE_NAME } from "@/lib/agreements/users";
import { cookies } from "next/headers";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const fail = (message: string, errors?: Record<string, string>): ActionState => ({ ok: false, message, errors });
const ok = (message: string): ActionState => ({ ok: true, message });
const safeAgreementsPath = (p: string) => (p.startsWith("/agreements") && !p.startsWith("//") && !p.includes("\\") ? p : "/agreements");

/* ---------------- accounts ---------------- */

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const db = defaultDeps().db;
  const ctx = await clientContext();
  const email = str(fd, "email");
  if (!rateLimit(`login-ip:${ctx.ip ?? "?"}`, 15, 15 * 60 * 1000).ok || !rateLimit(`login-email:${email.toLowerCase()}`, 8, 15 * 60 * 1000).ok) {
    return fail("Too many sign-in attempts. Please wait a few minutes and try again.");
  }
  await bootstrapFromEnv(db);
  const res = await login(db, email, str(fd, "password"), ctx);
  if (!res.ok) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return { ...fail(res.error), values: { email } };
  }
  await setSessionCookie(res.value.token);
  recordEvent(db, { type: "user.login", actorType: "user", actorRef: res.value.user.id, metadata: { ip: ctx.ip } });
  redirect(safeAgreementsPath(str(fd, "next")));
}

export async function logoutAction() {
  await endSession();
  redirect("/agreements/login");
}

export async function acceptInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await clientContext();
  if (!rateLimit(`invite-ip:${ctx.ip ?? "?"}`, 10, 60 * 60 * 1000).ok) return fail("Too many attempts. Try again later.");
  if (str(fd, "password") !== str(fd, "confirm")) return fail("The passwords don't match.");
  const res = await acceptInvite(defaultDeps().db, str(fd, "token"), str(fd, "password"));
  if (!res.ok) return fail(res.error);
  redirect("/agreements/login?activated=1");
}

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (str(fd, "next") !== str(fd, "confirm")) return fail("The new passwords don't match.");
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const db = defaultDeps().db;
  const res = await changePassword(db, user.id, str(fd, "current"), str(fd, "next"), token);
  if (!res.ok) return fail(res.error);
  recordEvent(db, { type: "user.password_changed", actorType: "user", actorRef: user.id });
  return ok("Password changed. Other devices were signed out.");
}

/* ---------------- agreements ---------------- */

export async function createAgreementAction() {
  const user = await requireUser();
  const res = createAgreement(defaultDeps().db, actorFor(user));
  if (!res.ok) redirect("/agreements");
  redirect(`/agreements/${res.value.agreement.id}/edit/buyer`);
}

export async function saveStepAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "agreementId");
  const step = str(fd, "step");
  if (!isEditableStep(step)) return fail("Unknown step.");
  let payload: unknown;
  try {
    payload = JSON.parse(str(fd, "payload"));
  } catch {
    return fail("The form data couldn't be read. Please reload the page.");
  }
  const res = saveStep(defaultDeps().db, actorFor(user), id, step as EditableStep, payload);
  if (!res.ok) return fail(res.error, res.fields);
  revalidatePath(`/agreements/${id}`, "layout");
  if (str(fd, "intent") === "next") {
    const idx = STEPS.findIndex((s) => s.key === step);
    const next = STEPS[idx + 1];
    redirect(`/agreements/${id}/edit/${next ? next.key : "preview"}`);
  }
  return ok("Saved.");
}

export async function uploadAttachmentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "agreementId");
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return fail("Choose a file to upload.");
  const kind = (["supporting", "inventory", "photo"].includes(str(fd, "kind")) ? str(fd, "kind") : "supporting") as "supporting" | "inventory" | "photo";
  const schedule = str(fd, "schedule") || null;
  const errors: string[] = [];
  let added = 0;
  for (const f of files) {
    const res = addAttachment(defaultDeps().db, actorFor(user), id, { name: f.name, bytes: Buffer.from(await f.arrayBuffer()) }, { kind, schedule });
    if (res.ok) added++;
    else errors.push(res.error);
  }
  revalidatePath(`/agreements/${id}`, "layout");
  if (errors.length) return fail(`${added} uploaded. ${errors.join(" ")}`);
  return ok(`${added} file${added === 1 ? "" : "s"} uploaded and stored privately.`);
}

export async function removeAttachmentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "agreementId");
  const res = removeAttachment(defaultDeps().db, actorFor(user), id, str(fd, "attachmentId"));
  revalidatePath(`/agreements/${id}`, "layout");
  return res.ok ? ok("Removed from this version.") : fail(res.error);
}

export async function submitReviewAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "agreementId");
  if (str(fd, "confirm") !== "on") return fail("Please confirm that you reviewed the agreement.");
  const res = submitForReview(defaultDeps().db, actorFor(user), id);
  if (!res.ok) return fail(res.error, res.fields);
  revalidatePath(`/agreements/${id}`, "layout");
  redirect(`/agreements/${id}/send`);
}

export async function returnToDraftAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "agreementId");
  const res = returnToDraft(defaultDeps().db, actorFor(user), id);
  revalidatePath(`/agreements/${id}`, "layout");
  return res.ok ? ok("Returned to draft.") : fail(res.error);
}

export async function upgradeTemplateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "agreementId");
  const res = upgradeToLatestTemplate(defaultDeps().db, actorFor(user), id);
  revalidatePath(`/agreements/${id}`, "layout");
  return res.ok ? ok("Now using the latest template wording.") : fail(res.error);
}

export async function sendAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "agreementId");
  if (str(fd, "confirm") !== "on") return fail("Please confirm that the parties have approved this version.");
  const res = await sendForSignature(defaultDeps(), actorFor(user), id, { order: str(fd, "order") as SigningOrder, expiryDays: Number(str(fd, "expiryDays")) });
  if (!res.ok) return fail(res.error);
  revalidatePath(`/agreements/${id}`, "layout");
  redirect(`/agreements/${id}?sent=1${res.value.invitationFailures.length ? "&mailfail=1" : ""}`);
}

export async function resendAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await resendInvitation(defaultDeps(), actorFor(user), str(fd, "signatureId"), "reminder");
  revalidatePath(`/agreements/${str(fd, "agreementId")}`, "layout");
  return res.ok ? ok("A new link was emailed (accepted by the email service). The old link no longer works.") : fail(res.error);
}

export async function revokeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = revokeInvitation(defaultDeps(), actorFor(user), str(fd, "signatureId"));
  revalidatePath(`/agreements/${str(fd, "agreementId")}`, "layout");
  return res.ok ? ok("Link revoked.") : fail(res.error);
}

export async function cancelAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const reason = str(fd, "reason").trim();
  if (!reason) return fail("Enter a reason.");
  const res = await cancelAgreement(defaultDeps(), actorFor(user), str(fd, "agreementId"), reason);
  revalidatePath(`/agreements/${str(fd, "agreementId")}`, "layout");
  return res.ok ? ok("Agreement cancelled.") : fail(res.error);
}

export async function reviseAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "agreementId");
  const res = await createRevision(defaultDeps(), actorFor(user), id, str(fd, "summary"));
  if (!res.ok) return fail(res.error);
  revalidatePath(`/agreements/${id}`, "layout");
  redirect(`/agreements/${id}/edit/buyer`);
}

export async function refreshStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "agreementId");
  const deps = defaultDeps();
  if (!caps(deps.db, actorFor(user), id).view) return fail("Agreement not found.");
  if (!rateLimit(`refresh:${user.id}`, 20, 60 * 1000).ok) return fail("Please wait a moment.");
  const { request } = currentSigners(deps.db, id);
  if (!request || request.status !== "active") return fail("There is no open signature request to check.");
  const res = await reconcileRequest(deps, request.id, "manual");
  revalidatePath(`/agreements/${id}`, "layout");
  return res.ok ? ok(res.changed ? "Updated from the e-signature service." : "No change at the e-signature service.") : fail(res.error);
}

export async function grantAccessAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "agreementId");
  const level = str(fd, "level") === "editor" ? "editor" : "viewer";
  const party = ["buyer", "seller", "attorney"].includes(str(fd, "party")) ? str(fd, "party") : null;
  const res = grantAccess(defaultDeps().db, actorFor(user), id, str(fd, "email"), level, party);
  revalidatePath(`/agreements/${id}`, "layout");
  return res.ok ? ok("Access granted.") : fail(res.error);
}

export async function revokeAccessAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "agreementId");
  const res = revokeAccess(defaultDeps().db, actorFor(user), id, str(fd, "userId"));
  revalidatePath(`/agreements/${id}`, "layout");
  return res.ok ? ok("Access removed.") : fail(res.error);
}

/* ---------------- administration ---------------- */

export async function inviteUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const role = str(fd, "role");
  if (!isRole(role)) return fail("Choose a role.");
  const deps = defaultDeps();
  const res = inviteUser(deps.db, { email: str(fd, "email"), name: str(fd, "name"), role });
  if (!res.ok) return fail(res.error);
  recordEvent(deps.db, { type: "user.invited", actorType: "user", actorRef: admin.id, metadata: { userId: res.value.user.id, role } });
  const link = `${deps.baseUrl}/agreements/invite/${res.value.inviteToken}`;
  const mail = await notify(deps, {
    kind: "user_invite", to: res.value.user.email, subject: "You're invited to the Maruf Cafe agreements portal", heading: "You've been invited",
    paragraphs: [`Hello ${res.value.user.name}, you've been invited as ${role}. Use the link below to choose a password. It expires in 7 days.`],
    cta: { label: "Set your password", url: link }, dedupeKey: `user_invite:${res.value.user.id}:${res.value.inviteToken.slice(0, 12)}`,
  });
  revalidatePath("/agreements/admin/users");
  return mail.status === "accepted"
    ? ok(`Invitation accepted by the email service for ${res.value.user.email}. Backup link (shown once): ${link}`)
    : { ok: true, message: `Email NOT sent (${mail.error ?? "email isn't configured"}). Send this link to ${res.value.user.email} yourself (shown once): ${link}` };
}

export async function setRoleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const role = str(fd, "role");
  const id = str(fd, "userId");
  const db = defaultDeps().db;
  const target = getUser(db, id);
  if (!target || !isRole(role)) return fail("Unknown user or role.");
  if (target.role === "admin" && role !== "admin" && countActiveAdmins(db) <= 1) return fail("There must be at least one active administrator.");
  setUserRole(db, id, role);
  recordEvent(db, { type: "user.role_changed", actorType: "user", actorRef: admin.id, metadata: { userId: id, role } });
  revalidatePath("/agreements/admin/users");
  return ok("Role updated.");
}

export async function toggleUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "userId");
  const db = defaultDeps().db;
  const target = getUser(db, id);
  if (!target) return fail("Unknown user.");
  const disable = target.status !== "disabled";
  if (disable && target.role === "admin" && countActiveAdmins(db) <= 1) return fail("There must be at least one active administrator.");
  if (disable && target.id === admin.id) return fail("You can't disable your own account.");
  setUserDisabled(db, id, disable);
  recordEvent(db, { type: disable ? "user.disabled" : "user.enabled", actorType: "user", actorRef: admin.id, metadata: { userId: id } });
  revalidatePath("/agreements/admin/users");
  return ok(disable ? "Account disabled and signed out." : "Account re-enabled.");
}

export async function saveTemplateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const clauses: Record<string, string> = {};
  for (const c of CLAUSES) {
    const v = fd.get(`clause:${c.key}`);
    if (typeof v === "string") clauses[c.key] = v;
  }
  const res = saveTemplate(defaultDeps().db, { id: admin.id, role: "admin" }, clauses, str(fd, "note"));
  if (!res.ok) return fail(res.error);
  revalidatePath("/agreements/admin/templates");
  return ok(`Saved as template version ${res.value.versionNo}. Existing agreements keep their current wording.`);
}

export async function saveSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const db = defaultDeps().db;
  const err = saveSettings(db, { defaultExpiryDays: Number(str(fd, "defaultExpiryDays")), reminderAfterDays: Number(str(fd, "reminderAfterDays")), retentionYears: Number(str(fd, "retentionYears")) });
  if (err) return fail(err);
  recordEvent(db, { type: "settings.updated", actorType: "user", actorRef: admin.id, metadata: getSettings(db) as unknown as Record<string, unknown> });
  revalidatePath("/agreements/admin/integrations");
  return ok("Settings saved.");
}

/* ---------------- signer (no account; authenticated by the private link) ---------------- */

export async function requestCodeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await clientContext();
  const res = await requestIdentityCode(defaultDeps(), str(fd, "token"), { ip: ctx.ip });
  return res.ok ? ok("We emailed a 6-digit code to the address this invitation was sent to. It expires in 10 minutes.") : fail(res.error);
}

export async function verifyCodeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await clientContext();
  const token = str(fd, "token");
  const res = verifyIdentityCode(defaultDeps(), token, str(fd, "code"), { ip: ctx.ip });
  if (!res.ok) return fail(res.error);
  await setSignerCookie(signerSessionValue(res.value));
  redirect(`/sign/${token}`);
}

export async function startSigningAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await clientContext();
  const token = str(fd, "token");
  const res = await startSigning(defaultDeps(), token, { esignConsent: str(fd, "esign") === "on", reviewedAll: str(fd, "reviewed") === "on" }, { ip: ctx.ip, userAgent: ctx.userAgent, sessionCookie: await getSignerCookie() });
  if (!res.ok) return fail(res.error);
  redirect(res.value.url);
}

export async function declineAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await clientContext();
  const token = str(fd, "token");
  const res = await declineAsSigner(defaultDeps(), token, str(fd, "reason"), { ip: ctx.ip, sessionCookie: await getSignerCookie() });
  if (!res.ok) return fail(res.error);
  redirect(`/sign/${token}`);
}

