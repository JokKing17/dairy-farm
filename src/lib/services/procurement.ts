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
    overrideRate: z.string().optional(),
    notes: z.string().max(500).optional(),
    noPickup: z.boolean().default(false),
    overrideReason: z.string().max(300).optional(),
  })).min(1).max(100),
});

export type ProcurementInput = z.infer<typeof procurementInputSchema>;

export async function postProcurementBatch(rawInput: ProcurementInput, actorId: string, canOverrideRate = false) {
  const input = procurementInputSchema.parse(rawInput);
  return transaction(async (database, session) => {
    const existing = await database.collection("idempotency_records").findOne({ key: input.idempotencyKey }, { session });
    if (existing) return existing.result;

    const settings = await database.collection("business_settings").findOne({ _id: "default" as never }, { session });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: String(settings?.timezone ?? "Asia/Karachi"), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const days = Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${input.businessDate}T00:00:00Z`).getTime()) / 86_400_000);
    const allowedBackdateDays = Number(settings?.allowedBackdateDays ?? 3);
    if (days < 0) throw new Error("Future milk receipts are not allowed.");
    if (days > allowedBackdateDays) throw new Error(`Milk receipts can only be backdated ${allowedBackdateDays} days.`);
    const postedLines = input.lines.filter((line) => !line.noPickup && line.quantity.trim() !== "");
    if (postedLines.length === 0) throw new Error("Enter at least one pickup quantity");
    const vendorIds = input.lines.map((line) => new ObjectId(line.vendorId));
    const duplicate = await database.collection("milk_purchases").findOne({ vendorId: { $in: vendorIds }, businessDate: input.businessDate, shift: input.shift, status: "posted" }, { session });
    if (duplicate) throw new Error("A vendor already has a posted entry for this date and shift");

    const now = new Date();
    const number = transactionNo("PROC");
    let totalQuantityMilli = 0n;
    let totalAmountPaisa = 0n;
    const purchases = [];
    const ledgerLines = [];
    const stockLines = [];

    for (const [index, line] of input.lines.entries()) {
      const vendorId = new ObjectId(line.vendorId);
      const vendor = await database.collection("vendors").findOne({ _id: vendorId, active: true }, { session });
      if (!vendor) throw new Error("One of the selected vendors is missing or inactive.");
      if (line.noPickup) {
        purchases.push({ transactionNo: number, lineNo: index + 1, vendorId, productSku: "MILK-001", businessDate: input.businessDate, shift: input.shift, quantityMilli: Long.ZERO, ratePaisa: Long.ZERO, amountPaisa: Long.ZERO, notes: line.notes || null, status: "no-pickup", createdAt: now, createdBy: actorId, updatedAt: now, updatedBy: actorId });
        continue;
      }
      if (!line.quantity.trim()) continue;
      const quantityMilli = quantityToMilli(line.quantity);
      const effectiveAt = new Date(`${input.businessDate}T23:59:59.999Z`);
      const rateRecord = await database.collection("vendor_rate_history").findOne({ vendorId, effectiveFrom: { $lte: effectiveAt }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: effectiveAt } }] }, { session, sort: { effectiveFrom: -1 } });
      if (!rateRecord?.ratePaisa) throw new Error(`${String(vendor.name)} has no milk rate for this date.`);
      let ratePaisa = (rateRecord.ratePaisa as Long).toBigInt();
      if (line.overrideRate?.trim()) {
        const requested = rupeesToPaisa(line.overrideRate);
        if (requested !== ratePaisa) {
          if (!canOverrideRate) throw new Error("You are not allowed to change vendor rates.");
          if (!line.overrideReason?.trim()) throw new Error(`Enter a rate-change reason for ${String(vendor.name)}.`);
          ratePaisa = requested;
        }
      }
      if (quantityMilli <= 0n || ratePaisa <= 0n) throw new Error("Quantity and rate must be greater than zero");
      const amountPaisa = multiplyQuantityRate(quantityMilli, ratePaisa);
      const lineNo = index + 1;
      totalQuantityMilli += quantityMilli;
      totalAmountPaisa += amountPaisa;
      purchases.push({ transactionNo: number, lineNo, vendorId, productSku: "MILK-001", businessDate: input.businessDate, shift: input.shift, quantity: Decimal128.fromString(line.quantity), quantityMilli: Long.fromBigInt(quantityMilli), ratePaisa: Long.fromBigInt(ratePaisa), amountPaisa: Long.fromBigInt(amountPaisa), rateOverrideReason: line.overrideReason || null, notes: line.notes || null, status: "posted", createdAt: now, createdBy: actorId, updatedAt: now, updatedBy: actorId });
      ledgerLines.push({ transactionNo: number, lineNo, partyType: "vendor", partyId: vendorId, date: now, businessDate: input.businessDate, debitPaisa: Long.ZERO, creditPaisa: Long.fromBigInt(amountPaisa), description: "Milk procurement", status: "posted", createdAt: now, createdBy: actorId });
      stockLines.push({ transactionNo: number, lineNo, productSku: "MILK-001", location: "main-shop", type: "vendor-purchase", quantityMilli: Long.fromBigInt(quantityMilli), unitCostPaisa: Long.fromBigInt(ratePaisa), businessDate: input.businessDate, date: now, status: "posted", createdAt: now, createdBy: actorId });
    }

    const header = await database.collection("procurement_batches").insertOne({ transactionNo: number, businessDate: input.businessDate, shift: input.shift, totalQuantityMilli: Long.fromBigInt(totalQuantityMilli), totalAmountPaisa: Long.fromBigInt(totalAmountPaisa), status: "posted", createdAt: now, createdBy: actorId, updatedAt: now, updatedBy: actorId }, { session });
    await database.collection("milk_purchases").insertMany(purchases, { session });
    await database.collection("party_ledger_entries").insertMany(ledgerLines, { session });
    await database.collection("inventory_movements").insertMany(stockLines, { session });
    const milk = await database.collection("products").findOne({ sku: "MILK-001" }, { session });
    if (!milk) throw new Error("Fresh Milk is not initialized. Run the seed command.");
    const oldStock = (milk.stockMilli as Long | undefined)?.toBigInt() ?? 0n;
    const oldCost = (milk.averageCostPaisa as Long | undefined)?.toBigInt() ?? 0n;
    const newStock = oldStock + totalQuantityMilli;
    const averageCost = newStock > 0n ? (oldStock * oldCost + totalAmountPaisa * 1000n) / newStock : 0n;
    await database.collection("products").updateOne({ _id: milk._id }, { $set: { stockMilli: Long.fromBigInt(newStock), averageCostPaisa: Long.fromBigInt(averageCost), updatedAt: now, updatedBy: actorId } }, { session });
    await database.collection("financial_transactions").insertOne({ transactionNo: number, kind: "procurement", amountPaisa: Long.fromBigInt(totalAmountPaisa), businessDate: input.businessDate, status: "posted", createdAt: now, createdBy: actorId }, { session });
    await database.collection("audit_logs").insertOne({ actorId, action: "post", entity: "procurement_batch", entityId: header.insertedId, createdAt: now }, { session });
    const result = { transactionNo: number, totalQuantityMilli: totalQuantityMilli.toString(), totalAmountPaisa: totalAmountPaisa.toString() };
    await database.collection("idempotency_records").insertOne({ key: input.idempotencyKey, operation: "procurement", result, createdAt: now }, { session });
    return result;
  });
}
