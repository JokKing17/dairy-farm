import argon2 from "argon2";
import { Long, MongoClient } from "mongodb";

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

  const products: [string, string, string, string, number, Record<string,unknown>][] = [
    ["MILK-001", "Fresh Milk", "liter", "dairy", 20000, {inventoryManaged:true,allowManualStockReceipt:false,sellable:true,availableInDailyDelivery:false,internalOnly:false,stockSource:"vendor-procurement"}],
    ["YOG-001", "Yogurt / Dahi", "kilogram", "dairy", 24000, {inventoryManaged:true,allowManualStockReceipt:false,sellable:true,availableInDailyDelivery:true,internalOnly:false,stockSource:"yogurt-production"}],
    ["BREAD-001", "Bread", "packet", "retail", 12000, {inventoryManaged:true,allowManualStockReceipt:true,sellable:true,availableInDailyDelivery:true,internalOnly:false,stockSource:"inventory-receipt"}],
    ["EGG-001", "Eggs", "piece", "retail", 0, {baseUnit:"piece",purchaseUnit:"tray",saleUnits:["piece","tray"],piecesPerTray:"30",defaultSaleUnit:"piece",inventoryManaged:true,allowManualStockReceipt:true,sellable:true,availableInDailyDelivery:true,internalOnly:false,stockSource:"inventory-receipt"}],
    ["ISPAGHOL-001", "Ispaghol / Psyllium Husk", "packet", "retail", 0, {inventoryManaged:true,allowManualStockReceipt:true,sellable:true,availableInDailyDelivery:true,internalOnly:false,stockSource:"inventory-receipt"}],
    ["KUNDA-001", "Kunda Dahi", "pot", "internal", 0, {inventoryManaged:false,allowManualStockReceipt:false,sellable:false,availableInDailyDelivery:false,internalOnly:true}],
    ["GL-001", "Gold Leaf", "packet", "disabled", 0, {inventoryManaged:false,allowManualStockReceipt:false,sellable:false,availableInDailyDelivery:false,internalOnly:false}],
  ];
  for (const [sku, productName, unit, category, rate, flags] of products) {
    await database.collection("products").updateOne(
      { sku },
      { $setOnInsert: { sku, name: productName, unit, category, retailRatePaisa: Long.fromNumber(rate), stockMilli: Long.ZERO, averageCostPaisa: Long.ZERO, lowStockMilli: Long.fromNumber(5000), active: sku!=="GL-001", ...flags, createdAt: now, updatedAt: now } },
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
