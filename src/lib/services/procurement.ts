import { Decimal128, Long, ObjectId } from "mongodb";
import { z } from "zod";
import { transaction } from "../db";
import { transactionNo } from "../ids";
import { integerToBigInt, multiplyQuantityRate, quantityToMilli, rupeesToPaisa } from "../money";
import { createNotification } from "./notification";

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

export const procurementEditSchema = z.object({
  transactionNo: z.string().min(1),
  lineNo: z.number().int().positive(),
  vendorId: z.string().refine(ObjectId.isValid, "Invalid vendor"),
  businessDate: z.iso.date(),
  shift: z.enum(["morning", "evening", "custom"]),
  quantity: z.string(),
  overrideRate: z.string().optional(),
  notes: z.string().max(500).optional(),
  noPickup: z.boolean().default(false),
  overrideReason: z.string().max(300).optional(),
});

export type ProcurementInput = z.infer<typeof procurementInputSchema>;
export type ProcurementEditInput = z.infer<typeof procurementEditSchema>;

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

    const existingVendorEntries = await database.collection("milk_purchases").find({ businessDate: input.businessDate, shift: input.shift, status: "posted" }, { session }).toArray();
    const postedVendorIds = new Set(existingVendorEntries.map((entry) => entry.vendorId.toString()));
    for (const line of input.lines) {
      if (line.noPickup || !line.quantity.trim()) continue;
      const vendorId = new ObjectId(line.vendorId);
      if (postedVendorIds.has(vendorId.toString())) {
        const vendor = await database.collection("vendors").findOne({ _id: vendorId }, { session });
        throw new Error(`${String(vendor?.name ?? "This vendor")} already has a posted entry for this date and shift`);
      }
    }

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
      let ratePaisa = integerToBigInt(rateRecord.ratePaisa);
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

    const milk = await database.collection("products").findOne({ sku: "MILK-001" }, { session });
    if (!milk) throw new Error("Fresh Milk is not initialized. Run the seed command.");
    const previousStockMilli = integerToBigInt(milk.stockMilli);
    const previousAverageCostPaisa = integerToBigInt(milk.averageCostPaisa);

    const header = await database.collection("procurement_batches").insertOne({ transactionNo: number, businessDate: input.businessDate, shift: input.shift, totalQuantityMilli: Long.fromBigInt(totalQuantityMilli), totalAmountPaisa: Long.fromBigInt(totalAmountPaisa), previousStockMilli: Long.fromBigInt(previousStockMilli), previousAverageCostPaisa: Long.fromBigInt(previousAverageCostPaisa), status: "posted", createdAt: now, createdBy: actorId, updatedAt: now, updatedBy: actorId }, { session });
    await database.collection("milk_purchases").insertMany(purchases, { session });
    await database.collection("party_ledger_entries").insertMany(ledgerLines, { session });
    await database.collection("inventory_movements").insertMany(stockLines, { session });
    const newStock = previousStockMilli + totalQuantityMilli;
    const averageCost = newStock > 0n ? (previousStockMilli * previousAverageCostPaisa + totalAmountPaisa * 1000n) / newStock : 0n;
    await database.collection("products").updateOne({ _id: milk._id }, { $set: { stockMilli: Long.fromBigInt(newStock), averageCostPaisa: Long.fromBigInt(averageCost), updatedAt: now, updatedBy: actorId } }, { session });
    await database.collection("financial_transactions").insertOne({ transactionNo: number, kind: "procurement", amountPaisa: Long.fromBigInt(totalAmountPaisa), businessDate: input.businessDate, status: "posted", createdAt: now, createdBy: actorId }, { session });
    await createNotification(database, { title: "Milk procurement posted", message: `${(Number(totalQuantityMilli) / 1000).toLocaleString()} L milk procured for PKR ${(Number(totalAmountPaisa) / 100).toLocaleString()}.`, category: "milk_procurement", priority: "medium", severity: "success", relatedType: "procurement_batch", relatedId: number, relatedHref: "/quick-entry" }, actorId, session);
    await database.collection("audit_logs").insertOne({ actorId, action: "post", entity: "procurement_batch", entityId: header.insertedId, metadata: { transactionNo: number, totalQuantityMilli: totalQuantityMilli.toString(), totalAmountPaisa: totalAmountPaisa.toString(), previousStockMilli: previousStockMilli.toString(), previousAverageCostPaisa: previousAverageCostPaisa.toString() }, createdAt: now }, { session });
    const result = { transactionNo: number, totalQuantityMilli: totalQuantityMilli.toString(), totalAmountPaisa: totalAmountPaisa.toString() };
    await database.collection("idempotency_records").insertOne({ key: input.idempotencyKey, operation: "procurement", result, createdAt: now }, { session });
    return result;
  });
}

export async function updateProcurementEntry(rawInput: ProcurementEditInput, actorId: string, canOverrideRate = false) {
  const input = procurementEditSchema.parse(rawInput);
  return transaction(async (database, session) => {
    const existing = await database.collection("milk_purchases").findOne({ transactionNo: input.transactionNo, lineNo: input.lineNo, status: "posted" }, { session });
    if (!existing) throw new Error("This procurement line is missing or already reversed.");

    const vendorId = new ObjectId(input.vendorId);
    const vendor = await database.collection("vendors").findOne({ _id: vendorId, active: true }, { session });
    if (!vendor) throw new Error("One of the selected vendors is missing or inactive.");

    const duplicateVendorEntry = await database.collection("milk_purchases").findOne({ vendorId: vendorId, businessDate: input.businessDate, shift: input.shift, status: "posted", _id: { $ne: existing._id } }, { session });
    if (duplicateVendorEntry) throw new Error("vendor already has a posted entry for this date and shift");

    const now = new Date();
    const quantityMilli = input.noPickup ? 0n : quantityToMilli(input.quantity);
    const effectiveAt = new Date(`${input.businessDate}T23:59:59.999Z`);
    const rateRecord = await database.collection("vendor_rate_history").findOne({ vendorId, effectiveFrom: { $lte: effectiveAt }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: effectiveAt } }] }, { session, sort: { effectiveFrom: -1 } });
    if (!rateRecord?.ratePaisa) throw new Error(`${String(vendor.name)} has no milk rate for this date.`);

    let ratePaisa = integerToBigInt(rateRecord.ratePaisa);
    if (input.overrideRate?.trim()) {
      const requested = rupeesToPaisa(input.overrideRate);
      if (requested !== ratePaisa) {
        if (!canOverrideRate) throw new Error("You are not allowed to change vendor rates.");
        if (!input.overrideReason?.trim()) throw new Error(`Enter a rate-change reason for ${String(vendor.name)}.`);
        ratePaisa = requested;
      }
    }

    if (quantityMilli < 0n || ratePaisa <= 0n) throw new Error("Quantity and rate must be greater than zero");

    const oldQuantityMilli = integerToBigInt(existing.quantityMilli);
    const oldAmountPaisa = integerToBigInt(existing.amountPaisa);
    const newAmountPaisa = quantityMilli > 0n ? multiplyQuantityRate(quantityMilli, ratePaisa) : 0n;
    const deltaQuantityMilli = quantityMilli - oldQuantityMilli;
    const deltaAmountPaisa = newAmountPaisa - oldAmountPaisa;

    await database.collection("milk_purchases").updateOne(
      { _id: existing._id, status: "posted" },
      {
        $set: {
          vendorId: vendorId,
          businessDate: input.businessDate,
          shift: input.shift,
          quantity: Decimal128.fromString(input.quantity),
          quantityMilli: Long.fromBigInt(quantityMilli),
          ratePaisa: Long.fromBigInt(ratePaisa),
          amountPaisa: Long.fromBigInt(newAmountPaisa),
          rateOverrideReason: input.overrideReason || null,
          notes: input.notes || null,
          status: "posted",
          updatedAt: now,
          updatedBy: actorId,
        },
      },
      { session },
    );

    await database.collection("party_ledger_entries").updateOne(
      { transactionNo: input.transactionNo, lineNo: input.lineNo, partyType: "vendor", partyId: vendorId, status: "posted" },
      { $set: { businessDate: input.businessDate, creditPaisa: Long.fromBigInt(newAmountPaisa), updatedAt: now, updatedBy: actorId } },
      { session },
    );

    await database.collection("inventory_movements").updateOne(
      { transactionNo: input.transactionNo, lineNo: input.lineNo, productSku: "MILK-001", type: "vendor-purchase", status: "posted" },
      { $set: { businessDate: input.businessDate, quantityMilli: Long.fromBigInt(quantityMilli), unitCostPaisa: Long.fromBigInt(ratePaisa), date: now, updatedAt: now, updatedBy: actorId } },
      { session },
    );

    const batch = await database.collection("procurement_batches").findOne({ transactionNo: input.transactionNo, status: "posted" }, { session });
    if (!batch) throw new Error("This procurement receipt header is missing or already reversed.");

    const revisedBatchQuantityMilli = integerToBigInt(batch.totalQuantityMilli) + deltaQuantityMilli;
    const revisedBatchAmountPaisa = integerToBigInt(batch.totalAmountPaisa) + deltaAmountPaisa;
    await database.collection("procurement_batches").updateOne(
      { _id: batch._id, status: "posted" },
      { $set: { businessDate: input.businessDate, shift: input.shift, totalQuantityMilli: Long.fromBigInt(revisedBatchQuantityMilli), totalAmountPaisa: Long.fromBigInt(revisedBatchAmountPaisa), updatedAt: now, updatedBy: actorId } },
      { session },
    );

    const milk = await database.collection("products").findOne({ sku: "MILK-001" }, { session });
    if (!milk) throw new Error("Fresh Milk product is missing.");
    const currentStockMilli = integerToBigInt(milk.stockMilli);
    const currentAverageCostPaisa = integerToBigInt(milk.averageCostPaisa);
    const revisedStockMilli = currentStockMilli - oldQuantityMilli + quantityMilli;
    const revisedAverageCostPaisa = revisedStockMilli > 0n ? (currentStockMilli * currentAverageCostPaisa + deltaAmountPaisa * 1000n) / revisedStockMilli : 0n;
    await database.collection("products").updateOne(
      { _id: milk._id },
      { $set: { stockMilli: Long.fromBigInt(revisedStockMilli), averageCostPaisa: Long.fromBigInt(revisedAverageCostPaisa), updatedAt: now, updatedBy: actorId } },
      { session },
    );

    await database.collection("audit_logs").insertOne({
      actorId,
      action: "edit",
      entity: "procurement_entry",
      entityId: existing._id,
      metadata: {
        transactionNo: input.transactionNo,
        lineNo: input.lineNo,
        previousQuantityMilli: oldQuantityMilli.toString(),
        updatedQuantityMilli: quantityMilli.toString(),
        previousAmountPaisa: oldAmountPaisa.toString(),
        updatedAmountPaisa: newAmountPaisa.toString(),
      },
      createdAt: now,
    }, { session });

    return { transactionNo: input.transactionNo, lineNo: input.lineNo, quantityMilli: quantityMilli.toString(), amountPaisa: newAmountPaisa.toString() };
  });
}

export async function reverseProcurementBatch(transactionNumber: string, reason: string, actorId: string) {
  if (reason.trim().length < 5) throw new Error("Enter a clear reversal reason.");
  return transaction(async (database, session) => {
    const batch = await database
      .collection("procurement_batches")
      .findOne({ transactionNo: transactionNumber, status: "posted" }, { session });
    if (!batch) throw new Error("This procurement batch is missing or already reversed.");

    const previousStockMilli = integerToBigInt(batch.previousStockMilli);
    const previousAverageCostPaisa = integerToBigInt(batch.previousAverageCostPaisa);
    if (previousStockMilli === 0n && previousAverageCostPaisa === 0n && integerToBigInt(batch.totalQuantityMilli) > 0n) {
      throw new Error("This batch cannot be reversed because it was created before reversal data was stored.");
    }

    const milk = await database.collection("products").findOne({ sku: "MILK-001" }, { session });
    if (!milk) throw new Error("Fresh Milk product is missing.");
    const currentStock = integerToBigInt(milk.stockMilli);
    const removedQuantity = integerToBigInt(batch.totalQuantityMilli);

    if (currentStock < removedQuantity) {
      throw new Error(`Cannot reverse: only ${currentStock} milli-units of milk remain, but ${removedQuantity} need to be removed.`);
    }

    const now = new Date();
    const reversalNo = transactionNo("REV-PROC");
    const purchases = await database
      .collection("milk_purchases")
      .find({ transactionNo: transactionNumber, status: "posted" }, { session })
      .toArray();

    const reverseMovements = purchases
      .filter((p) => p.status === "posted" && integerToBigInt(p.quantityMilli) > 0n)
      .map((p, index) => ({
        transactionNo: reversalNo,
        lineNo: index + 1,
        vendorId: p.vendorId,
        productSku: "MILK-001",
        location: "main-shop",
        type: "procurement-reversal",
        quantityMilli: Long.fromBigInt(-integerToBigInt(p.quantityMilli)),
        unitCostPaisa: p.ratePaisa,
        businessDate: batch.businessDate,
        date: now,
        status: "posted",
        reversesTransactionNo: transactionNumber,
        createdAt: now,
        createdBy: actorId,
      }));

    const reverseLedger = purchases
      .filter((p) => p.status === "posted" && integerToBigInt(p.amountPaisa) > 0n)
      .map((p, index) => ({
        transactionNo: reversalNo,
        lineNo: index + 1,
        partyType: "vendor",
        partyId: p.vendorId,
        date: now,
        businessDate: batch.businessDate,
        debitPaisa: p.amountPaisa,
        creditPaisa: Long.ZERO,
        description: `Reversal of ${transactionNumber}`,
        status: "posted",
        createdAt: now,
        createdBy: actorId,
      }));

    if (reverseMovements.length) await database.collection("inventory_movements").insertMany(reverseMovements, { session });
    if (reverseLedger.length) await database.collection("party_ledger_entries").insertMany(reverseLedger, { session });

    await database.collection("products").updateOne(
      { _id: milk._id, stockMilli: milk.stockMilli },
      { $set: { stockMilli: Long.fromBigInt(previousStockMilli), averageCostPaisa: Long.fromBigInt(previousAverageCostPaisa), updatedAt: now, updatedBy: actorId } },
      { session },
    );

    await database.collection("financial_transactions").insertOne({
      transactionNo: reversalNo,
      kind: "procurement_reversal",
      amountPaisa: Long.fromBigInt(-integerToBigInt(batch.totalAmountPaisa)),
      businessDate: batch.businessDate,
      reversesTransactionNo: transactionNumber,
      status: "posted",
      createdAt: now,
      createdBy: actorId,
    }, { session });

    await database.collection("milk_purchases").updateMany(
      { transactionNo: transactionNumber, status: "posted" },
      { $set: { status: "reversed", reversedAt: now, reversedBy: actorId, reversalTransactionNo: reversalNo } },
      { session },
    );

    await database.collection("procurement_batches").updateOne(
      { _id: batch._id, status: "posted" },
      { $set: { status: "reversed", reversedBy: actorId, reversedAt: now, reversalReason: reason.trim(), reversalTransactionNo: reversalNo, updatedAt: now, updatedBy: actorId } },
      { session },
    );

    await database.collection("audit_logs").insertOne({
      actorId,
      action: "reverse",
      entity: "procurement_batch",
      entityId: transactionNumber,
      metadata: { transactionNumber, reversalNo, reason: reason.trim() },
      createdAt: now,
    }, { session });

    return { reversalNo };
  });
}
