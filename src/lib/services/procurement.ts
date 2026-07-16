import { Decimal128, Long, ObjectId } from "mongodb";
import { z } from "zod";
import { transaction } from "../db";
import { transactionNo } from "../ids";
import { multiplyQuantityRate, quantityToMilli, rupeesToPaisa } from "../money";

export const procurementInputSchema = z.object({
  businessDate: z.iso.date(),
  shift: z.enum(["morning", "evening", "custom"]),
  idempotencyKey: z.uuid(),
  lines: z.array(z.object({
    vendorId: z.string().refine(ObjectId.isValid, "Invalid vendor"),
    quantity: z.string(),
    rate: z.string(),
    notes: z.string().max(500).optional(),
    noPickup: z.boolean().default(false),
    overrideReason: z.string().max(300).optional(),
  })).min(1).max(100),
});

export type ProcurementInput = z.infer<typeof procurementInputSchema>;

export async function postProcurementBatch(rawInput: ProcurementInput, actorId: string) {
  const input = procurementInputSchema.parse(rawInput);
  return transaction(async (database, session) => {
    const existing = await database.collection("idempotency_records").findOne({ key: input.idempotencyKey }, { session });
    if (existing) return existing.result;

    const postedLines = input.lines.filter((line) => !line.noPickup && line.quantity.trim() !== "");
    if (postedLines.length === 0) throw new Error("Enter at least one pickup quantity");
    const vendorIds = postedLines.map((line) => new ObjectId(line.vendorId));
    const duplicate = await database.collection("milk_purchases").findOne({ vendorId: { $in: vendorIds }, businessDate: input.businessDate, shift: input.shift, status: "posted" }, { session });
    if (duplicate) throw new Error("A vendor already has a posted entry for this date and shift");

    const now = new Date();
    const number = transactionNo("PROC");
    let totalQuantityMilli = 0n;
    let totalAmountPaisa = 0n;
    const purchases = [];
    const ledgerLines = [];
    const stockLines = [];

    for (const [index, line] of postedLines.entries()) {
      const quantityMilli = quantityToMilli(line.quantity);
      const ratePaisa = rupeesToPaisa(line.rate);
      if (quantityMilli <= 0n || ratePaisa <= 0n) throw new Error("Quantity and rate must be greater than zero");
      const amountPaisa = multiplyQuantityRate(quantityMilli, ratePaisa);
      const lineNo = index + 1;
      totalQuantityMilli += quantityMilli;
      totalAmountPaisa += amountPaisa;
      const vendorId = new ObjectId(line.vendorId);
      purchases.push({ transactionNo: number, lineNo, vendorId, productSku: "MILK-001", businessDate: input.businessDate, shift: input.shift, quantity: Decimal128.fromString(line.quantity), quantityMilli: Long.fromBigInt(quantityMilli), ratePaisa: Long.fromBigInt(ratePaisa), amountPaisa: Long.fromBigInt(amountPaisa), rateOverrideReason: line.overrideReason || null, notes: line.notes || null, status: "posted", createdAt: now, createdBy: actorId, updatedAt: now, updatedBy: actorId });
      ledgerLines.push({ transactionNo: number, lineNo, partyType: "vendor", partyId: vendorId, date: now, businessDate: input.businessDate, debitPaisa: Long.ZERO, creditPaisa: Long.fromBigInt(amountPaisa), description: "Milk procurement", status: "posted", createdAt: now, createdBy: actorId });
      stockLines.push({ transactionNo: number, lineNo, productSku: "MILK-001", location: "main-shop", type: "vendor-purchase", quantityMilli: Long.fromBigInt(quantityMilli), unitCostPaisa: Long.fromBigInt(ratePaisa), businessDate: input.businessDate, date: now, status: "posted", createdAt: now, createdBy: actorId });
    }

    const header = await database.collection("procurement_batches").insertOne({ transactionNo: number, businessDate: input.businessDate, shift: input.shift, totalQuantityMilli: Long.fromBigInt(totalQuantityMilli), totalAmountPaisa: Long.fromBigInt(totalAmountPaisa), status: "posted", createdAt: now, createdBy: actorId, updatedAt: now, updatedBy: actorId }, { session });
    await database.collection("milk_purchases").insertMany(purchases, { session });
    await database.collection("party_ledger_entries").insertMany(ledgerLines, { session });
    await database.collection("inventory_movements").insertMany(stockLines, { session });
    await database.collection("financial_transactions").insertOne({ transactionNo: number, kind: "procurement", amountPaisa: Long.fromBigInt(totalAmountPaisa), businessDate: input.businessDate, status: "posted", createdAt: now, createdBy: actorId }, { session });
    await database.collection("audit_logs").insertOne({ actorId, action: "post", entity: "procurement_batch", entityId: header.insertedId, createdAt: now }, { session });
    const result = { transactionNo: number, totalQuantityMilli: totalQuantityMilli.toString(), totalAmountPaisa: totalAmountPaisa.toString() };
    await database.collection("idempotency_records").insertOne({ key: input.idempotencyKey, operation: "procurement", result, createdAt: now }, { session });
    return result;
  });
}
