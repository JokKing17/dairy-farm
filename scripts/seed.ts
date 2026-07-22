import argon2 from "argon2";
import { Long, MongoClient } from "mongodb";
import { getDefaultProductCatalog } from "../src/lib/product-catalog";

const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true";
const name = process.env.MONGODB_DB ?? "dairyflow";
const client = new MongoClient(uri);
const database = client.db(name);
const now = new Date();

const unsafeSeedPasswords = new Set([
  "changeme123!",
  "replace-with-a-strong-unique-password",
  "password",
  "password123",
]);

async function main() {
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "owner@example.com";
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!password || password.length < 12 || unsafeSeedPasswords.has(password.toLowerCase())) {
    throw new Error("SEED_OWNER_PASSWORD must be a strong, non-default password of at least 12 characters");
  }
  await database.collection("users").updateOne(
    { email: ownerEmail },
    { $setOnInsert: { email: ownerEmail, name: "Business Owner", passwordHash: await argon2.hash(password, { type: argon2.argon2id }), role: "owner", active: true, sessionVersion: 1, createdAt: now, updatedAt: now } },
    { upsert: true },
  );

  for (const product of getDefaultProductCatalog()) {
    await database.collection("products").updateOne(
      { sku: product.sku },
      {
        $setOnInsert: {
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          category: product.category,
          retailRatePaisa: Long.fromNumber(product.retailRatePaisa ?? 0),
          stockMilli: Long.ZERO,
          averageCostPaisa: Long.ZERO,
          lowStockMilli: Long.fromNumber(product.lowStockMilli ?? 0),
          active: product.active ?? false,
          inventoryManaged: product.inventoryManaged ?? false,
          allowManualStockReceipt: product.allowManualStockReceipt ?? false,
          sellable: product.sellable ?? false,
          availableInDailyDelivery: product.availableInDailyDelivery ?? false,
          internalOnly: product.internalOnly ?? false,
          stockSource: product.stockSource,
          baseUnit: product.baseUnit,
          purchaseUnit: product.purchaseUnit,
          saleUnits: product.saleUnits,
          piecesPerTray: product.piecesPerTray,
          defaultSaleUnit: product.defaultSaleUnit,
          pieceSellingRatePaisa: product.pieceSellingRatePaisa ?? 0,
          traySellingRatePaisa: product.traySellingRatePaisa ?? 0,
          variantGroup: product.variantGroup,
          variantName: product.variantName,
          parentSku: product.parentSku,
          eggInventoryUnitVersion: product.sku === "EGG-001" ? 2 : undefined,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
  }
  await database.collection("business_settings").updateOne(
    { _id: "default" as never },
    { $setOnInsert: { businessName: "DairyFlow Milk & Yogurt", currency: "PKR", timezone: "Asia/Karachi", invoicePrefix: "DF", costingMethod: "moving-weighted-average", yogurtAutomaticMilkRatioParts:40,yogurtAutomaticOutputRatioParts:34,yogurtAutomaticYieldMilli:850,yogurtAutomaticLossMilli:150,yogurtYieldToleranceMilli:20,yogurtDefaultProductionMode:"automatic",yogurtMilkInputUnit:"kilogram",milkInventoryUnit:"liter",createdAt: now, updatedAt: now } },
    { upsert: true },
  );
  console.log(`Seed complete. Owner: ${ownerEmail}`);
}

main().finally(() => client.close());
