import { readAttachment } from "@/lib/agreements/repo";
import { actorFor, currentUser } from "@/lib/agreements/session";
import { getDb } from "@/lib/db/client";

/** Authenticated download of an uploaded supporting document. There is no public URL for any file. */
export async function GET(_req: Request, ctx: RouteContext<"/agreements/[id]/attachments/[aid]">) {
  const { id, aid } = await ctx.params;
  const user = await currentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const file = readAttachment(getDb(), actorFor(user), id, aid);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      // Always a download, never rendered in the browser, whatever the file claims to be.
      "Content-Type": file.row.contentType,
      "Content-Disposition": `attachment; filename="${file.row.fileName.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
