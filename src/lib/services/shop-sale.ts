import { Long, ObjectId, type Document } from "mongodb";
import { z } from "zod";
import { transaction } from "../db";
import { transactionNo } from "../ids";
import { eggSaleCalculation, normalizeEggQuantity, validatePiecesPerTray } from "../egg-units";
import {
  integerToBigInt,
  multiplyQuantityRate,
  quantityToMilli,
} from "../money";
import { createLowStockNotifications, createNotification } from "./notification";

const EGG_SKU = "EGG-001";

const lineSchema = z.object({
  sku: z.string().trim().min(1).max(30),
  quantity: z.string().max(20),
  saleUnit: z.enum(["piece", "tray"]).optional(),
  yogurtFormat: z.enum(["loose", "3", "3.5", "custom"]).default("loose"),
  customKundaSize: z.string().max(20).optional(),
});
export const shopSaleSchema = z.object({
  businessDate: z.iso.date(),
  idempotencyKey: z.uuid(),
  paymentType: z.enum(["cash", "credit"]),
  paymentMethod: z.enum(["cash", "bank", "easypaisa", "jazzcash"]).optional(),
  customerId: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  lines: z.array(lineSchema).min(1).max(30),
});
export type ShopSaleInput = z.infer<typeof shopSaleSchema>;

export async function postShopSale(raw: ShopSaleInput, actorId: string) {
  const input = shopSaleSchema.parse(raw);
  return transaction(async (database, session) => {
    const previous = await database
      .collection("idempotency_records")
      .findOne({ key: input.idempotencyKey }, { session });
    if (previous) return previous.result;
    if (input.paymentType === "cash" && !input.paymentMethod)
      throw new Error("Select how this Paid Now sale was received.");
    if (input.paymentType === "credit" && input.paymentMethod)
      throw new Error(
        "Do not select a payment account for an unpaid Credit sale.",
      );
    const settings = await database
      .collection("business_settings")
      .findOne({ _id: "default" as never }, { session });
    const shopMilkRatePaisa = integerToBigInt(settings?.shopRatePaisa);
    let customer: Document | null = null;
    if (input.customerId) {
      if (!ObjectId.isValid(input.customerId))
        throw new Error("Select a valid Shop Customer.");
      customer = await database
        .collection("customers")
        .findOne(
          {
            _id: new ObjectId(input.customerId),
            active: true,
            customerType: "shop",
          },
          { session },
        );
      if (!customer)
        throw new Error("The selected Shop Customer is missing or inactive.");
    }
    if (input.paymentType === "credit" && !customer)
      throw new Error("Credit / Udhaar requires a saved Shop Customer.");
    const seenLineKeys = new Set<string>();
    for (const line of input.lines) {
      const key =
        line.sku === EGG_SKU
          ? `${line.sku}:${line.saleUnit ?? ""}`
          : line.sku === "YOG-001"
            ? `${line.sku}:${line.yogurtFormat}:${line.customKundaSize ?? ""}`
            : line.sku;
      if (seenLineKeys.has(key))
        throw new Error("Combine duplicate product lines before posting.");
      seenLineKeys.add(key);
    }
    const products = await database
        .collection("products")
        .find(
          { sku: { $in: input.lines.map((line) => line.sku) } },
          { session },
        )
        .toArray(),
      bySku = new Map(
        products.map((product) => [String(product.sku), product]),
      );
    const now = new Date(),
      number = transactionNo("SS"),
      storedLines: Document[] = [],
      movements: Document[] = [],
      packagingMovements: Document[] = [];
    let total = 0n,
      totalCogs = 0n,
      lineNo = 0,
      packagingLineNo = 0,
      eggQuantityMilli = 0n,
      eggProduct: Document | null = null,
      eggStockMilli = 0n;
    for (const line of input.lines) {
      const product = bySku.get(line.sku);
      if (
        !product ||
        !product.active ||
        !product.sellable ||
        !product.inventoryManaged ||
        product.internalOnly ||
        line.sku === "KUNDA-001"
      )
        throw new Error(
          `${String(product?.name ?? line.sku)} is not available for Shop Sales.`,
        );
      const entered = quantityToMilli(line.quantity);
      if (entered <= 0n)
        throw new Error(`Enter a valid quantity for ${String(product.name)}.`);
        let quantityMilli = entered;
      let packaging: Document | null = null;
      let enteredQuantity = entered;
      let enteredUnit = String(product.unit);
      const defaultMilkRatePaisa = product.sku === "MILK-001" && integerToBigInt(product.retailRatePaisa) <= 0n ? shopMilkRatePaisa : integerToBigInt(product.retailRatePaisa);
      let sellingRatePerEnteredUnitPaisa = defaultMilkRatePaisa;
      const unitCostPaisa = integerToBigInt(product.averageCostPaisa);
      const pieceSellingRateSnapshotPaisa = integerToBigInt(product.pieceSellingRatePaisa, defaultMilkRatePaisa);
      const traySellingRateSnapshotPaisa = integerToBigInt(product.traySellingRatePaisa);
      const piecesPerTraySnapshot = validatePiecesPerTray(product.piecesPerTray);
      let normalizedPieceQuantity = entered;
      let lineAmountPaisa = multiplyQuantityRate(entered, sellingRatePerEnteredUnitPaisa);
      let costOfGoodsSoldPaisa = multiplyQuantityRate(entered, unitCostPaisa);
      let grossProfitPaisa = lineAmountPaisa - costOfGoodsSoldPaisa;
      if (line.sku === EGG_SKU) {
        if (!line.saleUnit)
          throw new Error("Select whether Eggs are sold by piece or tray.");
        const normalized = normalizeEggQuantity(line.quantity, line.saleUnit, piecesPerTraySnapshot),
          calculated = eggSaleCalculation({
            enteredQuantity: normalized.enteredQuantity,
            enteredUnit: normalized.enteredUnit,
            piecesPerTray: piecesPerTraySnapshot,
            pieceRatePaisa: pieceSellingRateSnapshotPaisa,
            trayRatePaisa: traySellingRateSnapshotPaisa,
            averageCostPerPiecePaisa: unitCostPaisa,
          });
        enteredQuantity = normalized.enteredQuantity;
        enteredUnit = normalized.enteredUnit;
        quantityMilli = calculated.normalizedQuantityMilli;
        normalizedPieceQuantity = calculated.normalizedPieces;
        sellingRatePerEnteredUnitPaisa = calculated.sellingRatePerEnteredUnitPaisa;
        lineAmountPaisa = calculated.lineAmountPaisa;
        costOfGoodsSoldPaisa = calculated.costOfGoodsSoldPaisa;
        grossProfitPaisa = calculated.grossProfitPaisa;
        eggQuantityMilli += quantityMilli;
        eggProduct ??= product;
        eggStockMilli = integerToBigInt(product.stockMilli);
      } else if (line.sku === "YOG-001" && line.yogurtFormat !== "loose") {
        const size =
            line.yogurtFormat === "custom"
              ? quantityToMilli(line.customKundaSize ?? "")
              : quantityToMilli(line.yogurtFormat),
          count = entered / 1000n;
        if (entered % 1000n !== 0n || count <= 0n)
          throw new Error(
            "Kunda quantity must be a whole number of containers.",
          );
        if (size !== 3000n && size !== 3500n && line.yogurtFormat !== "custom")
          throw new Error("This Kunda size is not allowed.");
        const batches = await database
            .collection("yogurt_packaging_movements")
            .aggregate(
              [
                {
                  $match: {
                    kundaSizeMilliKg: Long.fromBigInt(size),
                    status: "posted",
                    productionBatchNo: { $type: "string" },
                  },
                },
                {
                  $group: {
                    _id: "$productionBatchNo",
                    count: { $sum: "$countChange" },
                    firstCreatedAt: { $min: "$createdAt" },
                  },
                },
                { $match: { count: { $gt: 0 } } },
                { $sort: { firstCreatedAt: 1 } },
              ],
              { session },
            )
            .toArray(),
          availableCount = batches.reduce(
            (sum, batch) => sum + integerToBigInt(batch.count),
            0n,
          );
        if (availableCount < count)
          throw new Error(
            `Only ${availableCount} prepared ${line.yogurtFormat} kg Kundas are available.`,
          );
        quantityMilli = size * count;
        packaging = {
          format: line.yogurtFormat,
          sizeMilliKg: Long.fromBigInt(size),
          count: Number(count),
        };
        let remaining = count;
        for (const batch of batches) {
          if (remaining <= 0n) break;
          const used =
            integerToBigInt(batch.count) < remaining
              ? integerToBigInt(batch.count)
              : remaining;
          packagingMovements.push({
            transactionNo: number,
            lineNo: ++packagingLineNo,
            businessDate: input.businessDate,
            productionBatchNo: String(batch._id),
            sourceType: "shop_sale",
            sourceTransactionNo: number,
            kundaSizeMilliKg: Long.fromBigInt(size),
            countChange: Long.fromBigInt(-used),
            weightMilliKg: Long.fromBigInt(-(size * used)),
            status: "posted",
            createdBy: actorId,
            createdAt: now,
          });
          remaining -= used;
        }
      }
      const rate = line.sku === EGG_SKU ? sellingRatePerEnteredUnitPaisa : defaultMilkRatePaisa,
        cost = line.sku === EGG_SKU ? unitCostPaisa : integerToBigInt(product.averageCostPaisa);
      if (rate <= 0n)
        throw new Error(
          `Set a selling price for ${String(product.name)} first.`,
        );
      if (line.sku !== EGG_SKU) {
        const stock = integerToBigInt(product.stockMilli);
        if (stock < quantityMilli)
          throw new Error(
            `Not enough ${String(product.name)} stock. Available: ${stock} milli-${String(product.unit)}.`,
          );
        const updated = await database
          .collection("products")
          .updateOne(
            { _id: product._id, stockMilli: product.stockMilli },
            {
              $inc: { stockMilli: Long.fromBigInt(-quantityMilli) },
              $set: { updatedAt: now, updatedBy: actorId },
            },
            { session },
          );
        if (!updated.modifiedCount)
          throw new Error(
            `${String(product.name)} stock changed. Review and try again.`,
          );
      }
      const amount = line.sku === EGG_SKU ? lineAmountPaisa : multiplyQuantityRate(quantityMilli, rate),
        cogs = line.sku === EGG_SKU ? costOfGoodsSoldPaisa : multiplyQuantityRate(quantityMilli, cost),
        profit = line.sku === EGG_SKU ? grossProfitPaisa : amount - cogs;
      total += amount;
      totalCogs += cogs;
      storedLines.push({
        productId: product._id,
        productSku: line.sku,
        productName: String(product.name),
        unit: line.sku === EGG_SKU ? enteredUnit : String(product.unit),
        enteredQuantity: line.sku === EGG_SKU ? Long.fromBigInt(enteredQuantity) : undefined,
        enteredUnit: line.sku === EGG_SKU ? enteredUnit : undefined,
        piecesPerTraySnapshot: line.sku === EGG_SKU ? piecesPerTraySnapshot : undefined,
        normalizedPieceQuantity: line.sku === EGG_SKU ? Long.fromBigInt(normalizedPieceQuantity) : undefined,
        quantityMilli: Long.fromBigInt(quantityMilli),
        normalizedQuantityMilli: line.sku === EGG_SKU ? Long.fromBigInt(quantityMilli) : undefined,
        sellingRatePaisa: Long.fromBigInt(rate),
        sellingRatePerEnteredUnitPaisa: line.sku === EGG_SKU ? Long.fromBigInt(sellingRatePerEnteredUnitPaisa) : undefined,
        pieceSellingRateSnapshotPaisa: line.sku === EGG_SKU ? Long.fromBigInt(pieceSellingRateSnapshotPaisa) : undefined,
        traySellingRateSnapshotPaisa: line.sku === EGG_SKU ? Long.fromBigInt(traySellingRateSnapshotPaisa) : undefined,
        averageCostPerPiecePaisa: line.sku === EGG_SKU ? Long.fromBigInt(unitCostPaisa) : undefined,
        unitCostPaisa: Long.fromBigInt(cost),
        lineAmountPaisa: Long.fromBigInt(amount),
        costOfGoodsSoldPaisa: Long.fromBigInt(cogs),
        grossProfitPaisa: Long.fromBigInt(profit),
        yogurtPackaging: packaging,
      });
      movements.push({
        transactionNo: number,
        lineNo: ++lineNo,
        productId: product._id,
        productSku: line.sku,
        location: "main-shop",
        type: "shop-sale",
        quantityMilli: Long.fromBigInt(-quantityMilli),
        enteredQuantity: line.sku === EGG_SKU ? Long.fromBigInt(enteredQuantity) : undefined,
        enteredUnit: line.sku === EGG_SKU ? enteredUnit : undefined,
        piecesPerTray: line.sku === EGG_SKU ? piecesPerTraySnapshot : undefined,
        normalizedPieces: line.sku === EGG_SKU ? Long.fromBigInt(normalizedPieceQuantity) : undefined,
        unitSaleRatePaisa: Long.fromBigInt(rate),
        sellingRatePerEnteredUnitPaisa: line.sku === EGG_SKU ? Long.fromBigInt(sellingRatePerEnteredUnitPaisa) : undefined,
        pieceSellingRateSnapshotPaisa: line.sku === EGG_SKU ? Long.fromBigInt(pieceSellingRateSnapshotPaisa) : undefined,
        traySellingRateSnapshotPaisa: line.sku === EGG_SKU ? Long.fromBigInt(traySellingRateSnapshotPaisa) : undefined,
        averageCostPerPiecePaisa: line.sku === EGG_SKU ? Long.fromBigInt(unitCostPaisa) : undefined,
        unitCostPaisa: Long.fromBigInt(cost),
        revenuePaisa: Long.fromBigInt(amount),
        costOfGoodsSoldPaisa: Long.fromBigInt(cogs),
        grossProfitPaisa: Long.fromBigInt(profit),
        businessDate: input.businessDate,
        status: "posted",
        createdAt: now,
        createdBy: actorId,
      });
    }
    if (eggProduct) {
      if (eggStockMilli < eggQuantityMilli)
        throw new Error(
          `Not enough ${String(eggProduct.name)} stock. Available: ${eggStockMilli} milli-piece.`,
        );
      const updated = await database.collection("products").updateOne(
        { _id: eggProduct._id, stockMilli: eggProduct.stockMilli },
        {
          $inc: { stockMilli: Long.fromBigInt(-eggQuantityMilli) },
          $set: { updatedAt: now, updatedBy: actorId },
        },
        { session },
      );
      if (!updated.modifiedCount)
        throw new Error(
          `${String(eggProduct.name)} stock changed. Review and try again.`,
        );
    }
    const grossProfit = total - totalCogs,
      customerId = customer?._id ?? null;
    await database
      .collection("sales")
      .insertOne(
        {
          transactionNo: number,
          businessDate: input.businessDate,
          channel: "shop",
          paymentType: input.paymentType,
          paymentMethod:
            input.paymentType === "cash" ? input.paymentMethod : null,
          customerId,
          customerNameSnapshot: customer?.name ?? "Walk-in customer",
          lines: storedLines,
          subtotalPaisa: Long.fromBigInt(total),
          discountPaisa: Long.ZERO,
          totalPaisa: Long.fromBigInt(total),
          paidAmountPaisa: Long.fromBigInt(
            input.paymentType === "cash" ? total : 0n,
          ),
          creditAmountPaisa: Long.fromBigInt(
            input.paymentType === "credit" ? total : 0n,
          ),
          totalCostOfGoodsSoldPaisa: Long.fromBigInt(totalCogs),
          grossProfitPaisa: Long.fromBigInt(grossProfit),
          notes: input.notes || null,
          status: "posted",
          idempotencyKey: input.idempotencyKey,
          createdBy: actorId,
          createdAt: now,
          updatedBy: actorId,
          updatedAt: now,
        },
        { session },
      );
    await database
      .collection("inventory_movements")
      .insertMany(movements, { session });
    if (packagingMovements.length)
      await database
        .collection("yogurt_packaging_movements")
        .insertMany(packagingMovements, { session });
    if (input.paymentType === "cash")
      await database
        .collection("cashbook_entries")
        .insertOne(
          {
            transactionNo: number,
            lineNo: 1,
            businessDate: input.businessDate,
            account: input.paymentMethod,
            direction: "in",
            amountPaisa: Long.fromBigInt(total),
            description: `Shop Paid Sale ${number}`,
            sourceType: "shop_sale",
            status: "posted",
            createdAt: now,
            createdBy: actorId,
          },
          { session },
        );
    if (input.paymentType === "credit")
      await database
        .collection("party_ledger_entries")
        .insertOne(
          {
            transactionNo: number,
            lineNo: 1,
            partyType: "customer",
            partyId: customerId,
            businessDate: input.businessDate,
            date: now,
            debitPaisa: Long.fromBigInt(total),
            creditPaisa: Long.ZERO,
            description: `Shop Credit Sale ${number}`,
            status: "posted",
            createdAt: now,
            createdBy: actorId,
          },
          { session },
        );
    await database
      .collection("financial_transactions")
      .insertOne(
        {
          transactionNo: number,
          kind:
            input.paymentType === "cash"
              ? "shop_cash_sale"
              : "shop_credit_sale",
          amountPaisa: Long.fromBigInt(total),
          costOfGoodsSoldPaisa: Long.fromBigInt(totalCogs),
          grossProfitPaisa: Long.fromBigInt(grossProfit),
          businessDate: input.businessDate,
          status: "posted",
          createdAt: now,
          createdBy: actorId,
        },
        { session },
      );
    await createLowStockNotifications(database, input.lines.map((line) => line.sku), actorId, session);
    if (input.paymentType === "credit") {
      await createNotification(database, { title: "Shop credit sale recorded", message: `${String(customer?.name ?? "Shop customer")} now owes PKR ${(Number(total) / 100).toLocaleString()} for ${number}.`, category: "credit_customers", priority: "high", severity: "warning", relatedType: "shop_sale", relatedId: number, relatedHref: "/sales" }, actorId, session);
    } else if (total >= 1_000_000n) {
      await createNotification(database, { title: "Large shop sale completed", message: `Paid shop sale ${number} posted for PKR ${(Number(total) / 100).toLocaleString()}.`, category: "shop_sales", priority: "medium", severity: "success", relatedType: "shop_sale", relatedId: number, relatedHref: "/sales" }, actorId, session);
    }
    await database
      .collection("audit_logs")
      .insertOne(
        {
          actorId,
          action: "post",
          entity: "shop_sale",
          entityId: number,
          metadata: {
            paymentType: input.paymentType,
            customerId,
            totalPaisa: total.toString(),
          },
          createdAt: now,
        },
        { session },
      );
    const result = {
      transactionNo: number,
      totalPaisa: total.toString(),
      totalCostOfGoodsSoldPaisa: totalCogs.toString(),
      grossProfitPaisa: grossProfit.toString(),
    };
    await database
      .collection("idempotency_records")
      .insertOne(
        {
          key: input.idempotencyKey,
          operation: "shop_sale",
          result,
          createdAt: now,
        },
        { session },
      );
    return result;
  });
}

export async function reverseShopSale(
  transactionNumber: string,
  reason: string,
  actorId: string,
) {
  if (reason.trim().length < 5)
    throw new Error("Enter a clear Shop Sale reversal reason.");
  return transaction(async (database, session) => {
    const sale = await database
      .collection("sales")
      .findOne(
        { transactionNo: transactionNumber, channel: "shop", status: "posted" },
        { session },
      );
    if (!sale)
      throw new Error("This Shop Sale is missing or already reversed.");
    const now = new Date(),
      reversalNo = transactionNo("REV-SS"),
      lines = (sale.lines ?? []) as Document[];
    for (const line of lines) {
      const quantity = integerToBigInt(line.quantityMilli);
      await database
        .collection("products")
        .updateOne(
          { _id: line.productId },
          {
            $inc: { stockMilli: Long.fromBigInt(quantity) },
            $set: { updatedAt: now, updatedBy: actorId },
          },
          { session },
        );
    }
    await database.collection("inventory_movements").insertMany(
      lines.map((line, index) => ({
        transactionNo: reversalNo,
        lineNo: index + 1,
        productId: line.productId,
        productSku: line.productSku,
        location: "main-shop",
        type: "shop-sale-reversal",
        quantityMilli: line.quantityMilli,
        unitSaleRatePaisa: line.sellingRatePaisa,
        unitCostPaisa: line.unitCostPaisa,
        revenuePaisa: Long.fromBigInt(-integerToBigInt(line.lineAmountPaisa)),
        costOfGoodsSoldPaisa: Long.fromBigInt(
          -integerToBigInt(line.costOfGoodsSoldPaisa),
        ),
        grossProfitPaisa: Long.fromBigInt(
          -integerToBigInt(line.grossProfitPaisa),
        ),
        businessDate: sale.businessDate,
        status: "posted",
        reversesTransactionNo: transactionNumber,
        createdAt: now,
        createdBy: actorId,
      })),
      { session },
    );
    const packaging = await database
      .collection("yogurt_packaging_movements")
      .find(
        {
          sourceTransactionNo: transactionNumber,
          sourceType: "shop_sale",
          status: "posted",
        },
        { session },
      )
      .toArray();
    if (packaging.length)
      await database.collection("yogurt_packaging_movements").insertMany(
        packaging.map((movement, index) => ({
          transactionNo: reversalNo,
          lineNo: index + 1,
          businessDate: sale.businessDate,
          productionBatchNo: movement.productionBatchNo,
          sourceType: "shop_sale_reversal",
          sourceTransactionNo: reversalNo,
          kundaSizeMilliKg: movement.kundaSizeMilliKg,
          countChange: Long.fromBigInt(-integerToBigInt(movement.countChange)),
          weightMilliKg: Long.fromBigInt(
            -integerToBigInt(movement.weightMilliKg),
          ),
          status: "posted",
          createdBy: actorId,
          createdAt: now,
        })),
        { session },
      );
    const total = integerToBigInt(sale.totalPaisa);
    if (sale.paymentType === "cash")
      await database
        .collection("cashbook_entries")
        .insertOne(
          {
            transactionNo: reversalNo,
            lineNo: 1,
            businessDate: sale.businessDate,
            account: sale.paymentMethod,
            direction: "out",
            amountPaisa: Long.fromBigInt(total),
            description: `Reversal of ${transactionNumber}`,
            sourceType: "shop_sale_reversal",
            status: "posted",
            createdAt: now,
            createdBy: actorId,
          },
          { session },
        );
    else
      await database
        .collection("party_ledger_entries")
        .insertOne(
          {
            transactionNo: reversalNo,
            lineNo: 1,
            partyType: "customer",
            partyId: sale.customerId,
            businessDate: sale.businessDate,
            date: now,
            debitPaisa: Long.ZERO,
            creditPaisa: Long.fromBigInt(total),
            description: `Reversal of Shop Credit Sale ${transactionNumber}`,
            status: "posted",
            createdAt: now,
            createdBy: actorId,
          },
          { session },
        );
    await database
      .collection("financial_transactions")
      .insertOne(
        {
          transactionNo: reversalNo,
          kind: "shop_sale_reversal",
          amountPaisa: Long.fromBigInt(-total),
          costOfGoodsSoldPaisa: Long.fromBigInt(
            -integerToBigInt(sale.totalCostOfGoodsSoldPaisa),
          ),
          grossProfitPaisa: Long.fromBigInt(
            -integerToBigInt(sale.grossProfitPaisa),
          ),
          businessDate: sale.businessDate,
          reversesTransactionNo: transactionNumber,
          status: "posted",
          createdAt: now,
          createdBy: actorId,
        },
        { session },
      );
    await database
      .collection("sales")
      .updateOne(
        { _id: sale._id, status: "posted" },
        {
          $set: {
            status: "reversed",
            reversedBy: actorId,
            reversedAt: now,
            reversalReason: reason.trim(),
            reversalTransactionNo: reversalNo,
            updatedAt: now,
            updatedBy: actorId,
          },
        },
        { session },
      );
    await database
      .collection("audit_logs")
      .insertOne(
        {
          actorId,
          action: "reverse",
          entity: "shop_sale",
          entityId: sale._id,
          metadata: { transactionNumber, reversalNo, reason: reason.trim() },
          createdAt: now,
        },
        { session },
      );
    return { reversalNo };
  });
}
