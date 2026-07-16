import argon2 from "argon2";
import { Long, MongoClient, type IndexSpecification } from "mongodb";

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

const indexes: Record<string, IndexSpecification[]> = {
  milk_purchases: [{ vendorId: 1, businessDate: -1 }, { transactionNo: 1, lineNo: 1 }],
  party_ledger_entries: [{ partyType: 1, partyId: 1, date: 1 }, { transactionNo: 1, lineNo: 1 }],
  inventory_movements: [{ productId: 1, location: 1, date: -1 }, { transactionNo: 1, lineNo: 1 }],
  financial_transactions: [{ transactionNo: 1 }],
  notifications: [{ status: 1, createdAt: -1 }],
  audit_logs: [{ createdAt: -1 }],
  customers: [{ active: 1, name: 1 }, { code: 1 }],
  vendors: [{ active: 1, name: 1 }, { code: 1 }],
  vendor_rate_history: [{ vendorId: 1, effectiveFrom: -1 }],
  sessions: [{ sessionId: 1 }, { userId: 1, revokedAt: 1 }],
  login_attempts: [{ email: 1, createdAt: -1 }],
  idempotency_records: [{ key: 1 }],
};

async function ensureTtlIndex() {
  const collection = database.collection("idempotency_records");
  const exists = await database.listCollections({ name: "idempotency_records" }, { nameOnly: true }).hasNext();
  if (!exists) {
    await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2_592_000 });
    return;
  }
  const existing = await collection.indexes();
  const createdAt = existing.find((index) => index.key?.createdAt === 1);
  if (createdAt && createdAt.expireAfterSeconds !== 2_592_000) {
    await database.command({
      collMod: "idempotency_records",
      index: { name: createdAt.name, expireAfterSeconds: 2_592_000 },
    });
    return;
  }
  if (!createdAt) await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2_592_000 });
}

async function main() {
  await database.collection("users").createIndex({ email: 1 }, { unique: true });
  for (const [collection, keys] of Object.entries(indexes)) {
    for (const key of keys) {
      const first = Object.keys(key)[0];
      await database.collection(collection).createIndex(key, {
        unique: first === "transactionNo" || first === "sessionId" || first === "code" || first === "key",
      });
    }
  }
  await ensureTtlIndex();

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

  const products: [string, string, string, string, number][] = [
    ["MILK-001", "Fresh Milk", "liter", "dairy", 20000],
    ["YOG-001", "Yogurt / Dahi", "kilogram", "dairy", 24000],
    ["KUNDA-001", "Kunda Dahi", "pot", "dairy", 30000],
    ["BREAD-001", "Bread packets", "packet", "retail", 12000],
    ["EGG-001", "Eggs", "tray", "retail", 48000],
    ["GL-001", "Gold Leaf packs", "packet", "retail", 52000],
  ];
  for (const [sku, productName, unit, category, rate] of products) {
    await database.collection("products").updateOne(
      { sku },
      { $setOnInsert: { sku, name: productName, unit, category, retailRatePaisa: Long.fromNumber(rate), stockMilli: Long.ZERO, averageCostPaisa: Long.ZERO, lowStockMilli: Long.fromNumber(5000), active: true, createdAt: now, updatedAt: now } },
      { upsert: true },
    );
  }
  await database.collection("business_settings").updateOne(
    { _id: "default" as never },
    { $setOnInsert: { businessName: "DairyFlow Milk & Yogurt", currency: "PKR", timezone: "Asia/Karachi", invoicePrefix: "DF", costingMethod: "moving-weighted-average", createdAt: now, updatedAt: now } },
    { upsert: true },
  );
  console.log(`Seed complete. Owner: ${ownerEmail}`);
}

main().finally(() => client.close());
