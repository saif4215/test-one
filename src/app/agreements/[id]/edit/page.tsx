import { notFound, redirect } from "next/navigation";
import { loadAgreement } from "@/lib/agreements/repo";
import { actorFor, requireUser } from "@/lib/agreements/session";
import { getDb } from "@/lib/db/client";

/** Sends people to the first screen for the kind of agreement they have (quick form or full builder). */
export default async function EditEntry({ params }: PageProps<"/agreements/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser();
  const b = loadAgreement(getDb(), actorFor(user), id);
  if (!b) notFound();
  redirect(`/agreements/${id}/edit/${b.data.mode === "quick" ? "quick" : "buyer"}`);
}
