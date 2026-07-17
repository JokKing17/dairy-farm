"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { postProcurementBatch, procurementInputSchema } from "@/lib/services/procurement";

export type ProcurementState = { error?: string; result?: { transactionNo: string; totalQuantityMilli: string; totalAmountPaisa: string } };

export async function postProcurement(_: ProcurementState, formData: FormData): Promise<ProcurementState> {
  const actor = await requireSession(["owner", "manager"]);
  let payload: unknown;
  try { payload = JSON.parse(String(formData.get("payload"))); } catch { return { error: "The procurement draft is invalid." }; }
  const parsed = procurementInputSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid procurement batch" };
  try {
    const result = await postProcurementBatch(parsed.data, actor.userId, actor.role === "owner" || actor.role === "manager");
    revalidatePath("/dashboard"); revalidatePath("/vendors"); revalidatePath("/quick-entry");
    return { result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The procurement batch could not be posted." };
  }
}
