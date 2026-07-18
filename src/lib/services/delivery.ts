import { Long, ObjectId, type Document } from "mongodb";
import { z } from "zod";
import { calculateDeliveryCharge } from "../delivery-calculations";
import { transaction } from "../db";
import { transactionNo } from "../ids";
import { validatePiecesPerTray } from "../egg-units";
import { integerToBigInt, quantityToMilli } from "../money";
import { isDailyDeliveryProduct } from "../product-eligibility";

const productInput = z.object({
  sku: z.string().min(1).max(30),
  quantity: z.string().max(20),
  saleUnit: z.enum(["piece", "tray"]).optional(),
});

export const deliveryInputSchema = z.object({
  businessDate: z.iso.date(),
  idempotencyKey: z.uuid(),
  lines: z.array(
    z.object({
      customerId: z.string().refine(ObjectId.isValid, "Invalid customer"),
      deliveryStatus: z.enum(["delivered", "changed", "extra", "skipped", "paused"]),
      milkQuantity: z.string().max(20),
      products: z.array(productInput).max(10).default([]),
      notes: z.string().max(500).optional(),
    }),
  ).min(1).max(100),
});

export type DeliveryInput = z.infer<typeof deliveryInputSchema>;

const duplicateError = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);

export async function postDailyDeliveries(raw: DeliveryInput, actorId: string) {
  const input = deliveryInputSchema.parse(raw);
  return transaction(async (database, session) => {
    const previous = await database.collection("idempotency_records").findOne({ key: input.idempotencyKey }, { session });
    if (previous) return previous.result as { transactionNo: string; deliveredCustomers: number; skippedCustomers: number; totalMilkMilli: string; totalAmountPaisa: string };
    if (new Set(input.lines.map((line) => line.customerId)).size !== input.lines.length) throw new Error("A customer appears more than once in this delivery sheet.");
    const activeHouseholds = await database.collection("customers").find({ active: true, customerType: "household" }, { session, projection: { _id: 1 } }).toArray();
    const submittedCustomers = new Set(input.lines.map((line) => line.customerId));
    if (activeHouseholds.length !== input.lines.length || activeHouseholds.some((customer) => !submittedCustomers.has(customer._id.toString()))) throw new Error("The household customer list changed. Refresh the page before posting.");
    const existing = await database.collection("delivery_batches").findOne({ businessDate: input.businessDate, status: "posted" }, { session });
    if (existing) throw new Error(`Today's deliveries were already posted as ${String(existing.transactionNo)}.`);

    const settings = await database.collection("business_settings").findOne({ _id: "default" as never }, { session });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: String(settings?.timezone ?? "Asia/Karachi"), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const dayDifference = Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${input.businessDate}T00:00:00Z`).getTime()) / 86_400_000);
    const allowedBackdateDays = Number(settings?.allowedBackdateDays ?? 3);
    if (dayDifference < 0) throw new Error("Future household deliveries are not allowed.");
    if (dayDifference > allowedBackdateDays) throw new Error(`Household deliveries can only be backdated ${allowedBackdateDays} days.`);
    const defaultRate = integerToBigInt(settings?.customerRatePaisa);
    const productDocuments = await database.collection("products").find({ active: true }, { session }).toArray();
    const products = new Map(productDocuments.map((product) => [String(product.sku), product]));
    if (!products.has("MILK-001")) throw new Error("Fresh Milk is not initialized. Run the seed command.");

    const now = new Date();
    const number = transactionNo("DEL");
    const deliveryDocuments: Document[] = [];
    const ledgerDocuments: Document[] = [];
    const inventoryDocuments: Document[] = [];
    const inventoryRequired = new Map<string, bigint>();
    let totalMilkMilli = 0n;
    let totalAmountPaisa = 0n;
    let deliveredCustomers = 0;
    let skippedCustomers = 0;
    let inventoryLineNo = 0;

    for (const [index, line] of input.lines.entries()) {
      const customerId = new ObjectId(line.customerId);
      const customer = await database.collection("customers").findOne({ _id: customerId, active: true, customerType: "household" }, { session });
      if (!customer) throw new Error("One of the household customers is missing or inactive.");
      const effectiveAt = new Date(`${input.businessDate}T23:59:59.999Z`);
      const customerRate = await database.collection("customer_rate_history").findOne({ customerId, effectiveFrom: { $lte: effectiveAt }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: effectiveAt } }] }, { session, sort: { effectiveFrom: -1 } });
      const ratePaisa = integerToBigInt(customerRate?.ratePaisa ?? customer.milkRatePaisa, defaultRate);
      const wasDelivered = !["skipped", "paused"].includes(line.deliveryStatus);
      if (wasDelivered && ratePaisa <= 0n) throw new Error(`${String(customer.name)} has no valid milk rate.`);

      const pricedProducts = line.products.filter((item) => item.quantity.trim() && item.quantity !== "0").map((item) => {
        const product = products.get(item.sku);
        if (item.sku === "MILK-001" || !isDailyDeliveryProduct(product)) {
          if (product && integerToBigInt(product.retailRatePaisa) <= 0n) throw new Error(`Set a selling price for ${String(product.name)} first.`);
          throw new Error(`${String(product?.name ?? item.sku)} is out of stock or unavailable for daily delivery.`);
        }
        if (item.sku === "EGG-001") {
          const piecesPerTray = validatePiecesPerTray(product?.piecesPerTray);
          const saleUnit = item.saleUnit ?? product?.defaultSaleUnit ?? "piece";
          const pieceRatePaisa = integerToBigInt(product?.pieceSellingRatePaisa, product?.retailRatePaisa);
          const trayRatePaisa = integerToBigInt(product?.traySellingRatePaisa);
          const ratePaisa = saleUnit === "tray" ? trayRatePaisa : pieceRatePaisa;
          if (ratePaisa <= 0n) throw new Error("Set a selling price for Eggs first.");
          return {
            sku: item.sku,
            quantity: item.quantity,
            ratePaisa,
            costPaisa: integerToBigInt(product?.averageCostPaisa),
            saleUnit,
            piecesPerTray,
            pieceRatePaisa,
            trayRatePaisa,
          };
        }
        return { sku: item.sku, quantity: item.quantity, ratePaisa: integerToBigInt(product.retailRatePaisa), costPaisa: integerToBigInt(product.averageCostPaisa) };
      });
      const calculation = calculateDeliveryCharge({ deliveryStatus: line.deliveryStatus, milkQuantity: line.milkQuantity || "0", milkRatePaisa: ratePaisa, products: pricedProducts });
      if (wasDelivered && calculation.milkQuantityMilli <= 0n && calculation.otherAmountPaisa <= 0n) throw new Error(`Enter a delivered quantity for ${String(customer.name)}.`);

      const snapshottedProducts = pricedProducts.map((item) => {
        const quantityMilli = quantityToMilli(item.quantity);
        if (item.sku === "EGG-001") {
          const enteredQuantity = quantityMilli / 1000n;
          const normalizedPieces = item.saleUnit === "tray" ? enteredQuantity * BigInt(item.piecesPerTray ?? 30) : enteredQuantity;
          const amountPaisa = (quantityMilli * item.ratePaisa + 500n) / 1000n;
          const costOfGoodsSoldPaisa = normalizedPieces * item.costPaisa;
          inventoryRequired.set(item.sku, (inventoryRequired.get(item.sku) ?? 0n) + normalizedPieces * 1000n);
          inventoryDocuments.push({ transactionNo: number, lineNo: ++inventoryLineNo, productSku: item.sku, location: "main-shop", type: "customer-delivery", enteredQuantity: Long.fromBigInt(enteredQuantity), enteredUnit: item.saleUnit, piecesPerTray: item.piecesPerTray, normalizedPieces: Long.fromBigInt(normalizedPieces), quantityMilli: Long.fromBigInt(-normalizedPieces * 1000n), unitSaleRatePaisa: Long.fromBigInt(item.ratePaisa), sellingRatePerEnteredUnitPaisa: Long.fromBigInt(item.ratePaisa), pieceSellingRateSnapshotPaisa: Long.fromBigInt(item.pieceRatePaisa ?? item.ratePaisa), traySellingRateSnapshotPaisa: Long.fromBigInt(item.trayRatePaisa ?? item.ratePaisa), averageCostPerPiecePaisa: Long.fromBigInt(item.costPaisa), revenuePaisa: Long.fromBigInt(amountPaisa), costOfGoodsSoldPaisa: Long.fromBigInt(costOfGoodsSoldPaisa), grossProfitPaisa: Long.fromBigInt(amountPaisa - costOfGoodsSoldPaisa), businessDate: input.businessDate, date: now, status: "posted", sourceCustomerId: customerId, createdAt: now, createdBy: actorId });
          return { sku: item.sku, quantityMilli: Long.fromBigInt(quantityMilli), enteredQuantity: Long.fromBigInt(enteredQuantity), enteredUnit: item.saleUnit, piecesPerTray: item.piecesPerTray, normalizedPieces: Long.fromBigInt(normalizedPieces), ratePaisa: Long.fromBigInt(item.ratePaisa), unitCostPaisa: Long.fromBigInt(item.costPaisa), amountPaisa: Long.fromBigInt(amountPaisa), costOfGoodsSoldPaisa: Long.fromBigInt(costOfGoodsSoldPaisa), grossProfitPaisa: Long.fromBigInt(amountPaisa - costOfGoodsSoldPaisa) };
        }
        const amountPaisa = (quantityMilli * item.ratePaisa + 500n) / 1000n;
        const costOfGoodsSoldPaisa = (quantityMilli * item.costPaisa + 500n) / 1000n;
        inventoryRequired.set(item.sku, (inventoryRequired.get(item.sku) ?? 0n) + quantityMilli);
        inventoryDocuments.push({ transactionNo: number, lineNo: ++inventoryLineNo, productSku: item.sku, location: "main-shop", type: "customer-delivery", quantityMilli: Long.fromBigInt(-quantityMilli), unitSaleRatePaisa: Long.fromBigInt(item.ratePaisa), unitCostPaisa: Long.fromBigInt(item.costPaisa), revenuePaisa: Long.fromBigInt(amountPaisa), costOfGoodsSoldPaisa: Long.fromBigInt(costOfGoodsSoldPaisa), grossProfitPaisa: Long.fromBigInt(amountPaisa - costOfGoodsSoldPaisa), businessDate: input.businessDate, date: now, status: "posted", sourceCustomerId: customerId, createdAt: now, createdBy: actorId });
        return { sku: item.sku, quantityMilli: Long.fromBigInt(quantityMilli), ratePaisa: Long.fromBigInt(item.ratePaisa), unitCostPaisa: Long.fromBigInt(item.costPaisa), amountPaisa: Long.fromBigInt(amountPaisa), costOfGoodsSoldPaisa: Long.fromBigInt(costOfGoodsSoldPaisa), grossProfitPaisa: Long.fromBigInt(amountPaisa - costOfGoodsSoldPaisa) };
      });
      if (calculation.milkQuantityMilli > 0n) {
        inventoryRequired.set("MILK-001", (inventoryRequired.get("MILK-001") ?? 0n) + calculation.milkQuantityMilli);
        const milkCost = integerToBigInt(products.get("MILK-001")?.averageCostPaisa);
        const milkCogs = (calculation.milkQuantityMilli * milkCost + 500n) / 1000n;
        inventoryDocuments.push({ transactionNo: number, lineNo: ++inventoryLineNo, productSku: "MILK-001", location: "main-shop", type: "customer-delivery", quantityMilli: Long.fromBigInt(-calculation.milkQuantityMilli), unitSaleRatePaisa: Long.fromBigInt(ratePaisa), unitCostPaisa: Long.fromBigInt(milkCost), revenuePaisa: Long.fromBigInt(calculation.milkAmountPaisa), costOfGoodsSoldPaisa: Long.fromBigInt(milkCogs), grossProfitPaisa: Long.fromBigInt(calculation.milkAmountPaisa - milkCogs), businessDate: input.businessDate, date: now, status: "posted", sourceCustomerId: customerId, createdAt: now, createdBy: actorId });
      }

      const lineNo = index + 1;
      deliveryDocuments.push({ transactionNo: number, lineNo, customerId, businessDate: input.businessDate, milkQuantityMilli: Long.fromBigInt(calculation.milkQuantityMilli), milkRatePaisa: Long.fromBigInt(wasDelivered ? ratePaisa : 0n), milkAmountPaisa: Long.fromBigInt(calculation.milkAmountPaisa), otherProducts: snapshottedProducts, otherAmountPaisa: Long.fromBigInt(calculation.otherAmountPaisa), amountPaisa: Long.fromBigInt(calculation.totalAmountPaisa), deliveryStatus: line.deliveryStatus, notes: line.notes || null, status: "posted", createdAt: now, createdBy: actorId });
      if (calculation.totalAmountPaisa > 0n) ledgerDocuments.push({ transactionNo: number, lineNo, partyType: "customer", partyId: customerId, businessDate: input.businessDate, date: now, debitPaisa: Long.fromBigInt(calculation.totalAmountPaisa), creditPaisa: Long.ZERO, description: "Daily household delivery", status: "posted", createdAt: now, createdBy: actorId });
      totalMilkMilli += calculation.milkQuantityMilli;
      totalAmountPaisa += calculation.totalAmountPaisa;
      if (wasDelivered) deliveredCustomers++; else skippedCustomers++;
    }

    for (const [sku, required] of inventoryRequired) {
      const result = await database.collection("products").updateOne({ sku, active: true, stockMilli: { $gte: Long.fromBigInt(required) } }, { $inc: { stockMilli: Long.fromBigInt(-required) }, $set: { updatedAt: now, updatedBy: actorId } }, { session });
      if (!result.modifiedCount) throw new Error(`Not enough ${String(products.get(sku)?.name ?? sku)} stock for today's deliveries.`);
    }
    const totalCostOfGoodsSoldPaisa = inventoryDocuments.reduce((sum, movement) => sum + integerToBigInt(movement.costOfGoodsSoldPaisa), 0n), grossProfitPaisa = totalAmountPaisa - totalCostOfGoodsSoldPaisa;
    await database.collection("delivery_batches").insertOne({ transactionNo: number, businessDate: input.businessDate, deliveredCustomers, skippedCustomers, totalMilkMilli: Long.fromBigInt(totalMilkMilli), totalAmountPaisa: Long.fromBigInt(totalAmountPaisa), costOfGoodsSoldPaisa: Long.fromBigInt(totalCostOfGoodsSoldPaisa), grossProfitPaisa: Long.fromBigInt(grossProfitPaisa), status: "posted", createdAt: now, createdBy: actorId, updatedAt: now, updatedBy: actorId }, { session });
    await database.collection("customer_deliveries").insertMany(deliveryDocuments, { session });
    if (ledgerDocuments.length) await database.collection("party_ledger_entries").insertMany(ledgerDocuments, { session });
    if (inventoryDocuments.length) await database.collection("inventory_movements").insertMany(inventoryDocuments, { session });
    await database.collection("financial_transactions").insertOne({ transactionNo: number, kind: "customer_delivery", amountPaisa: Long.fromBigInt(totalAmountPaisa), costOfGoodsSoldPaisa: Long.fromBigInt(totalCostOfGoodsSoldPaisa), grossProfitPaisa: Long.fromBigInt(grossProfitPaisa), businessDate: input.businessDate, status: "posted", createdAt: now, createdBy: actorId }, { session });
    if (skippedCustomers > 0) await database.collection("notifications").insertOne({ title: "Today's household deliveries are incomplete.", message: `${skippedCustomers} customer${skippedCustomers === 1 ? " was" : "s were"} skipped or paused.`, severity: "warning", status: "open", relatedType: "daily_delivery_batch", relatedId: number, relatedHref: "/deliveries", createdAt: now, createdBy: actorId }, { session });
    await database.collection("audit_logs").insertOne({ actorId, action: "post", entity: "daily_delivery_batch", entityId: number, metadata: { businessDate: input.businessDate, deliveredCustomers, skippedCustomers }, createdAt: now }, { session });
    const result = { transactionNo: number, deliveredCustomers, skippedCustomers, totalMilkMilli: totalMilkMilli.toString(), totalAmountPaisa: totalAmountPaisa.toString() };
    await database.collection("idempotency_records").insertOne({ key: input.idempotencyKey, operation: "daily_deliveries", result, createdAt: now }, { session });
    return result;
  }).catch((error) => { if (duplicateError(error)) throw new Error("These deliveries were already posted. Refresh to see the existing receipt."); throw error; });
}

export async function reverseDailyDeliveries(transactionNumber: string, reason: string, actorId: string) {
  if (reason.trim().length < 5) throw new Error("Enter a clear reversal reason.");
  return transaction(async (database, session) => {
    const batch = await database
      .collection("delivery_batches")
      .findOne({ transactionNo: transactionNumber, status: "posted" }, { session });
    if (!batch) throw new Error("This delivery batch is missing or already reversed.");

    const now = new Date();
    const reversalNo = transactionNo("REV-DEL");
    const inventoryMovements = await database
      .collection("inventory_movements")
      .find({ transactionNo: transactionNumber, type: "customer-delivery", status: "posted" }, { session })
      .toArray();

    const stockToRestore = new Map<string, bigint>();
    for (const movement of inventoryMovements) {
      const sku = String(movement.productSku);
      const qty = integerToBigInt(movement.quantityMilli);
      stockToRestore.set(sku, (stockToRestore.get(sku) ?? 0n) - qty);
    }

    for (const [sku, restoreQty] of stockToRestore) {
      const result = await database.collection("products").updateOne(
        { sku, active: true },
        { $inc: { stockMilli: Long.fromBigInt(restoreQty) }, $set: { updatedAt: now, updatedBy: actorId } },
        { session },
      );
      if (!result.modifiedCount) throw new Error(`Product ${sku} is missing or inactive. Cannot reverse delivery.`);
    }

    const reverseMovements = inventoryMovements.map((movement, index) => ({
      transactionNo: reversalNo,
      lineNo: index + 1,
      productSku: movement.productSku,
      productId: movement.productId,
      location: movement.location,
      type: "customer-delivery-reversal",
      quantityMilli: Long.fromBigInt(-integerToBigInt(movement.quantityMilli)),
      unitCostPaisa: movement.unitCostPaisa,
      unitSaleRatePaisa: movement.unitSaleRatePaisa,
      revenuePaisa: Long.fromBigInt(-integerToBigInt(movement.revenuePaisa)),
      costOfGoodsSoldPaisa: Long.fromBigInt(-integerToBigInt(movement.costOfGoodsSoldPaisa)),
      grossProfitPaisa: Long.fromBigInt(-integerToBigInt(movement.grossProfitPaisa)),
      businessDate: batch.businessDate,
      date: now,
      status: "posted",
      reversesTransactionNo: transactionNumber,
      createdAt: now,
      createdBy: actorId,
    }));

    if (reverseMovements.length) {
      await database.collection("inventory_movements").insertMany(reverseMovements, { session });
    }

    const ledgerEntries = await database
      .collection("party_ledger_entries")
      .find({ transactionNo: transactionNumber, status: "posted" }, { session })
      .toArray();

    if (ledgerEntries.length) {
      const reverseLedger = ledgerEntries.map((entry, index) => ({
        transactionNo: reversalNo,
        lineNo: index + 1,
        partyType: entry.partyType,
        partyId: entry.partyId,
        businessDate: batch.businessDate,
        date: now,
        debitPaisa: entry.creditPaisa,
        creditPaisa: entry.debitPaisa,
        description: `Reversal of ${transactionNumber}`,
        status: "posted",
        createdAt: now,
        createdBy: actorId,
      }));
      await database.collection("party_ledger_entries").insertMany(reverseLedger, { session });
    }

    await database.collection("financial_transactions").insertOne({
      transactionNo: reversalNo,
      kind: "customer_delivery_reversal",
      amountPaisa: Long.fromBigInt(-integerToBigInt(batch.totalAmountPaisa)),
      costOfGoodsSoldPaisa: Long.fromBigInt(-integerToBigInt(batch.costOfGoodsSoldPaisa)),
      grossProfitPaisa: Long.fromBigInt(-integerToBigInt(batch.grossProfitPaisa)),
      businessDate: batch.businessDate,
      status: "posted",
      reversesTransactionNo: transactionNumber,
      createdAt: now,
      createdBy: actorId,
    }, { session });

    await database.collection("customer_deliveries").updateMany(
      { transactionNo: transactionNumber, status: "posted" },
      { $set: { status: "reversed", reversedAt: now, reversedBy: actorId, reversalTransactionNo: reversalNo } },
      { session },
    );

    await database.collection("delivery_batches").updateOne(
      { _id: batch._id, status: "posted" },
      { $set: { status: "reversed", reversedBy: actorId, reversedAt: now, reversalReason: reason.trim(), reversalTransactionNo: reversalNo, updatedAt: now, updatedBy: actorId } },
      { session },
    );

    await database.collection("audit_logs").insertOne({
      actorId,
      action: "reverse",
      entity: "daily_delivery_batch",
      entityId: transactionNumber,
      metadata: { transactionNumber, reversalNo, reason: reason.trim() },
      createdAt: now,
    }, { session });

    return { reversalNo };
  });
}
