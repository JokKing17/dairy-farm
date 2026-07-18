"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { postExpense, expenseInputSchema } from "@/lib/services/expense";

export type ExpenseState = { error?: string; result?: { transactionNo: string; amountPaisa: string } };

export async function createExpense(_: ExpenseState, formData: FormData): Promise<ExpenseState> {
  const actor = await requireSession(["owner", "manager", "accountant"]);
  let payload: unknown;
  try { payload = JSON.parse(String(formData.get("payload"))); } catch { return { error: "The expense form is invalid." }; }
  const parsed = expenseInputSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the expense details." };
  try {
    const result = await postExpense(parsed.data, actor.userId);
    revalidatePath("/expenses");
    revalidatePath("/dashboard");
    revalidatePath("/cashbook");
    return { result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The expense could not be posted." };
  }
}
