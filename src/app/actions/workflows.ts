"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { toggleChecklistItem } from "@/lib/repo/operations";

export async function toggleChecklistAction(period: string, periodKey: string, item: string) {
  if (!["daily", "weekly", "monthly"].includes(period)) return;
  toggleChecklistItem(getDb(), period, periodKey, item);
  revalidatePath("/workflows");
}
