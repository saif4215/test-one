"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { listingSchema } from "@/lib/domain/product";
import { fNum, fStr } from "@/lib/forms";
import { getProduct, updateProduct } from "@/lib/repo/products";

export async function saveListingAction(productId: number, fd: FormData) {
  const db = getDb();
  const rec = getProduct(db, productId);
  if (!rec) redirect("/listing-research");
  const listing = listingSchema.parse({
    title: fStr(fd, "title") ?? "",
    bullets: (fStr(fd, "bullets") ?? "").split(/\n/).map((b) => b.trim()).filter(Boolean),
    description: fStr(fd, "description") ?? "",
    variations: fStr(fd, "variations") ?? "",
    size: fStr(fd, "size") ?? "",
    color: fStr(fd, "color") ?? "",
    packCount: fNum(fd, "packCount"),
    imageCount: fNum(fd, "imageCount"),
    searchTerms: fStr(fd, "searchTerms") ?? "",
    customerQuestions: fStr(fd, "customerQuestions") ?? "",
    complaints: fStr(fd, "complaints") ?? "",
    reviewThemes: fStr(fd, "reviewThemes") ?? "",
    checkedAt: new Date().toISOString(),
  });
  updateProduct(db, productId, { ...rec.data, listing });
  revalidatePath("/listing-research");
  redirect(`/listing-research?product=${productId}&saved=1`);
}
