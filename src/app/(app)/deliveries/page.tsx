import { db } from "@/lib/db";
import { formatMilli, integerToBigInt } from "@/lib/money";
import { karachiBusinessDate } from "@/lib/queries";
import { DeliverySheet } from "./delivery-sheet";
import { DAILY_DELIVERY_CATALOG_FILTER, DAILY_DELIVERY_CATALOG_SKUS } from "@/lib/product-eligibility";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DailyDeliveriesPage() {
  const database = await db();
  const now = new Date();
  const businessDate = karachiBusinessDate();
  const [customers, settings, products, existingBatch] = await Promise.all([
    database.collection("customers").aggregate([
      { $match: { active: true, customerType: "household" } },
      {
        $lookup: {
          from: "customer_rate_history",
          let: { customer: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$customerId", "$$customer"] },
                effectiveFrom: { $lte: now },
                $or: [{ effectiveTo: null }, { effectiveTo: { $gt: now } }],
              },
            },
            { $sort: { effectiveFrom: -1 } },
            { $limit: 1 },
          ],
          as: "effectiveRate",
        },
      },
      { $sort: { deliverySequence: 1, name: 1 } },
    ]).toArray(),
    database.collection("business_settings").findOne({ _id: "default" as never }),
    database.collection("products").find(DAILY_DELIVERY_CATALOG_FILTER).toArray(),
    database.collection("delivery_batches").findOne({ businessDate, status: "posted" }),
  ]);

  const defaultRate = integerToBigInt(settings?.customerRatePaisa);
  const customerRows = customers.map((customer) => ({
    id: customer._id.toString(),
    code: String(customer.code),
    name: String(customer.name),
    address: String(customer.address ?? ""),
    normalQuantity: formatMilli(integerToBigInt(customer.defaultQuantityMilli)),
    ratePaisa: integerToBigInt(customer.effectiveRate?.[0]?.ratePaisa ?? customer.milkRatePaisa, defaultRate).toString(),
    paused: Boolean(customer.paused),
  }));

  const productMap = new Map(products.map((product) => [String(product.sku), product]));
  const names: Record<string, string> = {
    "YOG-001": "Yogurt / Dahi",
    "BREAD-001": "Bread",
    "EGG-001": "Eggs",
    "ISPAGHOL-001": "Ispaghol / Psyllium Husk",
  };
  const units: Record<string, string> = {
    "YOG-001": "kilogram",
    "BREAD-001": "packet",
    "EGG-001": "piece",
    "ISPAGHOL-001": "packet",
  };

  const productRows = DAILY_DELIVERY_CATALOG_SKUS.map((sku) => {
    const product = productMap.get(sku);
    const stock = integerToBigInt(product?.stockMilli);
    const source = sku === "YOG-001" ? "yogurt-production" : "inventory-receipt";
    const pieceSellingRatePaisa = integerToBigInt(product?.pieceSellingRatePaisa, product?.retailRatePaisa);
    const traySellingRatePaisa = integerToBigInt(product?.traySellingRatePaisa);
    let unavailableReason: string | undefined;

    if (!product || product.stockSource !== source || stock <= 0n) {
      unavailableReason = sku === "YOG-001" ? "No Yogurt available — create a Yogurt batch" : "Out of stock — add inventory";
    } else if (sku === "EGG-001" && pieceSellingRatePaisa <= 0n && traySellingRatePaisa <= 0n) {
      unavailableReason = "Set Egg selling prices first";
    } else if (sku !== "EGG-001" && integerToBigInt(product.retailRatePaisa) <= 0n) {
      unavailableReason = "Set a selling price first";
    }

    return {
      sku,
      name: String(product?.name ?? names[sku]),
      unit: String(product?.unit ?? units[sku]),
      ratePaisa: integerToBigInt(product?.retailRatePaisa).toString(),
      stockMilli: stock.toString(),
      stockSource: String(product?.stockSource ?? source),
      piecesPerTray: Number(product?.piecesPerTray ?? 30),
      defaultSaleUnit: String(product?.defaultSaleUnit ?? "piece") as "piece" | "tray",
      pieceSellingRatePaisa: pieceSellingRatePaisa.toString(),
      traySellingRatePaisa: traySellingRatePaisa.toString(),
      unavailableReason,
    };
  });

  return (
    <div className="content">
      <PageHeader title="Daily Deliveries" description="One simple household list for today. Normal Milk quantities are pre-filled."/>
      {existingBatch ? (
        <div className="card table-card form-success">
          <b>Today was already posted as {String(existingBatch.transactionNo)}</b>
          <span>Duplicate delivery charges are blocked.</span>
        </div>
      ) : customerRows.length ? (
        <DeliverySheet customers={customerRows} products={productRows} today={businessDate} />
      ) : (
        <div className="card table-card empty-state">
          <b>No active household customers</b>
          <span>Add household customers before posting daily deliveries.</span>
        </div>
      )}
    </div>
  );
}
