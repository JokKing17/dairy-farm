"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { deliveryInputSchema, postDailyDeliveries } from "@/lib/services/delivery";

export type DeliveryState = { error?: string; result?: { transactionNo: string; deliveredCustomers: number; skippedCustomers: number; totalMilkMilli: string; totalAmountPaisa: string } };
export async function postDeliveries(_: DeliveryState, formData: FormData): Promise<DeliveryState> {
  const actor = await requireSession(["owner", "manager", "delivery"]);
  let payload: unknown;
  try { payload = JSON.parse(String(formData.get("payload"))); } catch { return { error: "The daily delivery sheet is invalid." }; }
  const parsed = deliveryInputSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the daily delivery sheet." };
  try {
    const result = await postDailyDeliveries(parsed.data, actor.userId);
    revalidatePath("/deliveries"); revalidatePath("/customers"); revalidatePath("/dashboard"); revalidatePath("/inventory");
    return { result };
  } catch (error) { return { error: error instanceof Error ? error.message : "Today's deliveries could not be posted." }; }
}
