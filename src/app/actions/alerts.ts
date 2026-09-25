"use server";

import { revalidatePath } from "next/cache";
import { runDealFinder } from "@/lib/alerts/dealFinder";
import { getDb } from "@/lib/db/client";
import { deleteAlert, listAlerts, markAlertRead } from "@/lib/repo/operations";

export async function runDealFinderAction() {
  runDealFinder(getDb());
  revalidatePath("/alerts");
  revalidatePath("/");
}

export async function markAlertReadAction(id: number, read: boolean) {
  markAlertRead(getDb(), id, read);
  revalidatePath("/alerts");
  revalidatePath("/");
}

export async function markAllReadAction() {
  const db = getDb();
  for (const a of listAlerts(db, { unreadOnly: true })) markAlertRead(db, a.id, true);
  revalidatePath("/alerts");
  revalidatePath("/");
}

export async function deleteAlertAction(id: number) {
  deleteAlert(getDb(), id);
  revalidatePath("/alerts");
}
