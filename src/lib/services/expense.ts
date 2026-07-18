import { Long } from "mongodb";
import { z } from "zod";
import { transaction } from "../db";
import { transactionNo } from "../ids";
import { rupeesToPaisa } from "../money";

const CATEGORIES = [
  "utilities",
  "rent",
  "salaries",
  "transport",
  "office-supplies",
  "maintenance",
  "marketing",
  "insurance",
  "taxes",
  "miscellaneous",
] as const;

const PAYMENT_METHODS = ["cash", "bank", "easypaisa", "jazzcash"] as const;

export const expenseInputSchema = z.object({
  businessDate: z.iso.date(),
  category: z.enum(CATEGORIES),
  amount: z.string(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  description: z.string().trim().max(500).optional(),
  idempotencyKey: z.uuid(),
});

export const EXPENSE_CATEGORIES = CATEGORIES;
export const EXPENSE_PAYMENT_METHODS = PAYMENT_METHODS;

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

export async function postExpense(rawInput: ExpenseInput, actorId: string) {
  const input = expenseInputSchema.parse(rawInput);
  return transaction(async (database, session) => {
    const existing = await database
      .collection("idempotency_records")
      .findOne({ key: input.idempotencyKey }, { session });
    if (existing) return existing.result;

    const settings = await database
      .collection("business_settings")
      .findOne({ _id: "default" as never }, { session });
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: String(settings?.timezone ?? "Asia/Karachi"),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const days = Math.round(
      (new Date(`${today}T00:00:00Z`).getTime() -
        new Date(`${input.businessDate}T00:00:00Z`).getTime()) /
        86_400_000,
    );
    const allowedBackdateDays = Number(settings?.allowedBackdateDays ?? 3);
    if (days < 0) throw new Error("Future expenses are not allowed.");
    if (days > allowedBackdateDays)
      throw new Error(`Expenses can only be backdated ${allowedBackdateDays} days.`);

    let amountPaisa: bigint;
    try {
      amountPaisa = rupeesToPaisa(input.amount);
    } catch {
      throw new Error("Enter a valid PKR amount.");
    }
    if (amountPaisa <= 0n) throw new Error("Amount must be greater than zero.");

    const now = new Date();
    const number = transactionNo("EXP");

    await database.collection("expenses").insertOne(
      {
        transactionNo: number,
        businessDate: input.businessDate,
        category: input.category,
        paymentMethod: input.paymentMethod,
        amountPaisa: Long.fromBigInt(amountPaisa),
        description: input.description ?? null,
        status: "posted",
        createdAt: now,
        createdBy: actorId,
      },
      { session },
    );

    await database.collection("cashbook_entries").insertOne(
      {
        transactionNo: number,
        lineNo: 1,
        businessDate: input.businessDate,
        account: input.paymentMethod,
        direction: "out",
        amountPaisa: Long.fromBigInt(amountPaisa),
        description: `${input.category} expense`,
        sourceType: "expense",
        status: "posted",
        createdAt: now,
        createdBy: actorId,
      },
      { session },
    );

    await database.collection("financial_transactions").insertOne(
      {
        transactionNo: number,
        kind: "expense",
        amountPaisa: Long.fromBigInt(-amountPaisa),
        category: input.category,
        businessDate: input.businessDate,
        status: "posted",
        createdAt: now,
        createdBy: actorId,
      },
      { session },
    );

    await database.collection("audit_logs").insertOne(
      {
        actorId,
        action: "post",
        entity: "expense",
        entityId: number,
        metadata: {
          category: input.category,
          amountPaisa: amountPaisa.toString(),
        },
        createdAt: now,
      },
      { session },
    );

    const result = {
      transactionNo: number,
      amountPaisa: amountPaisa.toString(),
    };
    await database.collection("idempotency_records").insertOne(
      {
        key: input.idempotencyKey,
        operation: "expense",
        result,
        createdAt: now,
      },
      { session },
    );
    return result;
  });
}
