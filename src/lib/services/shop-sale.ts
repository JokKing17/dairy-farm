import { Long, ObjectId, type Document } from "mongodb";
import { z } from "zod";
import { transaction } from "../db";
import { transactionNo } from "../ids";
import {
  integerToBigInt,
  multiplyQuantityRate,
  quantityToMilli,
} from "../money";
import { eggSaleCalculation, wholeEnteredQuantity, validatePiecesPerTray } from "../egg-units";

const lineSchema = z.object({
  sku: z.string().trim().min(1).max(30),
  quantity: z.string().max(20),
  yogurtFormat: z.enum(["loose", "3", "3.5", "custom"]).default("loose"),
  customKundaSize: z.string().max(20).optional(),
  saleUnit: z.enum(["piece","tray"]).optional(),
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
    const lineKeys=input.lines.map(line=>`${line.sku}:${line.sku==="EGG-001"?line.saleUnit??"":line.sku==="YOG-001"?line.yogurtFormat:"default"}`);
    if(new Set(lineKeys).size!==lineKeys.length)throw new Error("Combine duplicate product and unit lines before posting.");
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
      packagingLineNo = 0;
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
      let quantityMilli = entered,
        packaging: Document | null = null;
      if (line.sku === "YOG-001" && line.yogurtFormat !== "loose") {
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
      let rate=integerToBigInt(product.retailRatePaisa),cost=integerToBigInt(product.averageCostPaisa),amount:bigint,cogs:bigint,eggSnapshot:Document|null=null;
      if(line.sku==="EGG-001"){
        if(line.saleUnit!=="piece"&&line.saleUnit!=="tray")throw new Error("Select whether Eggs are sold by piece or tray.");
        const piecesPerTray=validatePiecesPerTray(product.piecesPerTray),enteredQuantity=wholeEnteredQuantity(line.quantity,line.saleUnit==="tray"?"Egg tray quantity":"Egg piece quantity"),calculation=eggSaleCalculation({enteredQuantity,enteredUnit:line.saleUnit,piecesPerTray,pieceRatePaisa:integerToBigInt(product.pieceSellingRatePaisa,product.retailRatePaisa),trayRatePaisa:integerToBigInt(product.traySellingRatePaisa),averageCostPerPiecePaisa:cost});
        quantityMilli=calculation.normalizedQuantityMilli;rate=calculation.sellingRatePerEnteredUnitPaisa;amount=calculation.lineAmountPaisa;cogs=calculation.costOfGoodsSoldPaisa;eggSnapshot={enteredQuantity:Long.fromBigInt(enteredQuantity),enteredUnit:line.saleUnit,piecesPerTraySnapshot:piecesPerTray,normalizedPieceQuantity:Long.fromBigInt(calculation.normalizedPieces),normalizedQuantityMilli:Long.fromBigInt(quantityMilli),sellingRatePerEnteredUnitPaisa:Long.fromBigInt(rate),pieceSellingRateSnapshotPaisa:product.pieceSellingRatePaisa??product.retailRatePaisa,traySellingRateSnapshotPaisa:product.traySellingRatePaisa,averageCostPerPiecePaisa:Long.fromBigInt(cost)};
      }else{
        if(line.saleUnit)throw new Error("Egg sale units can only be used with Eggs.");
        amount=multiplyQuantityRate(quantityMilli,rate);cogs=multiplyQuantityRate(quantityMilli,cost);
      }
      if (rate <= 0n)
        throw new Error(
          `Set a selling price for ${String(product.name)} first.`,
        );
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
      const profit = amount - cogs;
      total += amount;
      totalCogs += cogs;
      storedLines.push({
        productId: product._id,
        productSku: line.sku,
        productName: String(product.name),
        productNameSnapshot:String(product.name),
        unit: String(product.unit),
        quantityMilli: Long.fromBigInt(quantityMilli),
        sellingRatePaisa: Long.fromBigInt(rate),
        unitCostPaisa: Long.fromBigInt(cost),
        lineAmountPaisa: Long.fromBigInt(amount),
        costOfGoodsSoldPaisa: Long.fromBigInt(cogs),
        grossProfitPaisa: Long.fromBigInt(profit),
        yogurtPackaging: packaging,
        ...(eggSnapshot??{}),
      });
      movements.push({
        transactionNo: number,
        lineNo: ++lineNo,
        productId: product._id,
        productSku: line.sku,
        location: "main-shop",
        type: "shop-sale",
        quantityMilli: Long.fromBigInt(-quantityMilli),
        unitSaleRatePaisa: Long.fromBigInt(rate),
        unitCostPaisa: Long.fromBigInt(cost),
        revenuePaisa: Long.fromBigInt(amount),
        costOfGoodsSoldPaisa: Long.fromBigInt(cogs),
        grossProfitPaisa: Long.fromBigInt(profit),
        businessDate: input.businessDate,
        status: "posted",
        createdAt: now,
        createdBy: actorId,
        ...(eggSnapshot?{enteredQuantity:eggSnapshot.enteredQuantity,enteredUnit:eggSnapshot.enteredUnit,piecesPerTray:eggSnapshot.piecesPerTraySnapshot,normalizedPieces:eggSnapshot.normalizedPieceQuantity}:{}),
      });
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
