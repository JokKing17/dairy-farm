import { Long } from "mongodb";
import { z } from "zod";
import { transaction } from "../db";
import { transactionNo } from "../ids";
import { rupeesToPaisa } from "../money";
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS } from "../expense-constants";
import { createNotification } from "./notification";

export const expenseInputSchema = z.object({
  businessDate: z.iso.date(),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.string(),
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS),
  description: z.string().trim().max(500).optional(),
  idempotencyKey: z.uuid(),
});

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

    if (amountPaisa >= 1_000_000n) {
      await createNotification(database, { title: "Large expense recorded", message: `${input.category} expense posted for PKR ${(Number(amountPaisa) / 100).toLocaleString()}.`, category: "expenses", priority: "high", severity: "warning", relatedType: "expense", relatedId: number, relatedHref: "/expenses" }, actorId, session);
    }

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

export async function reverseExpense(transactionNumber: string, reason: string, actorId: string) {
  if (reason.trim().length < 5) throw new Error("Enter a clear reversal reason.");
  return transaction(async (database, session) => {
    const expense = await database
      .collection("expenses")
      .findOne({ transactionNo: transactionNumber, status: "posted" }, { session });
    if (!expense) throw new Error("This expense is missing or already reversed.");

    const now = new Date();
    const reversalNo = transactionNo("REV-EXP");
    const amountPaisa = Long.fromBigInt(-(expense.amountPaisa instanceof Long ? expense.amountPaisa.toBigInt() : BigInt(String(expense.amountPaisa))));

    await database.collection("cashbook_entries").insertOne(
      {
        transactionNo: reversalNo,
        lineNo: 1,
        businessDate: expense.businessDate,
        account: expense.paymentMethod,
        direction: "in",
        amountPaisa,
        description: `Reversal of ${transactionNumber}`,
        sourceType: "expense_reversal",
        status: "posted",
        createdAt: now,
        createdBy: actorId,
      },
      { session },
    );

    await database.collection("financial_transactions").insertOne(
      {
        transactionNo: reversalNo,
        kind: "expense_reversal",
        amountPaisa,
        category: expense.category,
        businessDate: expense.businessDate,
        reversesTransactionNo: transactionNumber,
        status: "posted",
        createdAt: now,
        createdBy: actorId,
      },
      { session },
    );

    await database
      .collection("expenses")
      .updateOne(
        { _id: expense._id, status: "posted" },
        {
          $set: {
            status: "reversed",
            reversedBy: actorId,
            reversedAt: now,
            reversalReason: reason.trim(),
            reversalTransactionNo: reversalNo,
          },
        },
        { session },
      );

    await database.collection("audit_logs").insertOne(
      {
        actorId,
        action: "reverse",
        entity: "expense",
        entityId: transactionNumber,
        metadata: { transactionNumber, reversalNo, reason: reason.trim() },
        createdAt: now,
      },
      { session },
    );

    return { reversalNo };
  });
}
