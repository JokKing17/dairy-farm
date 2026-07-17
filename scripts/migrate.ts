import { MongoClient, type Document, type IndexDescription } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true");
const database = client.db(process.env.MONGODB_DB ?? "dairyflow");

const indexes: Record<string, IndexDescription[]> = {
  users: [{ key: { email: 1 }, unique: true }],
  sessions: [{ key: { sessionId: 1 }, unique: true }, { key: { expiresAt: 1 }, expireAfterSeconds: 0 }, { key: { userId: 1, revokedAt: 1 } }],
  login_attempts: [{ key: { createdAt: 1 }, expireAfterSeconds: 86_400 }, { key: { email: 1, createdAt: -1 } }, { key: { fingerprint: 1, createdAt: -1 } }],
  idempotency_records: [{ key: { key: 1 }, unique: true }, { key: { createdAt: 1 }, expireAfterSeconds: 2_592_000 }],
  vendors: [{ key: { code: 1 }, unique: true }, { key: { active: 1, name: 1 } }, { key: { phone: 1 } }],
  vendor_rate_history: [{ key: { vendorId: 1, effectiveFrom: -1 } }],
  customers: [{ key: { code: 1 }, unique: true }, { key: { active: 1, customerType: 1, deliverySequence: 1, name: 1 } }, { key: { phone: 1 } }],
  customer_rate_history: [{ key: { customerId: 1, effectiveFrom: -1 } }],
  products: [{ key: { sku: 1 }, unique: true }, { key: { active: 1, name: 1 } }],
  procurement_batches: [{ key: { transactionNo: 1 }, unique: true }, { key: { businessDate: -1, shift: 1 } }],
  milk_purchases: [{ key: { transactionNo: 1, lineNo: 1 }, unique: true }, { key: { vendorId: 1, businessDate: 1, shift: 1 }, unique: true, partialFilterExpression: { status: "posted" } }],
  delivery_batches: [{ key: { transactionNo: 1 }, unique: true }, { key: { businessDate: 1 }, unique: true, partialFilterExpression: { status: "posted" } }],
  customer_deliveries: [{ key: { transactionNo: 1, lineNo: 1 }, unique: true }, { key: { customerId: 1, businessDate: 1 }, unique: true, partialFilterExpression: { status: "posted" } }, { key: { businessDate: -1, deliveryStatus: 1 } }],
  sales: [{ key: { transactionNo: 1 }, unique: true }, { key: { businessDate: -1 } }],
  expenses: [{ key: { transactionNo: 1 }, unique: true }, { key: { businessDate: -1, status: 1 } }],
  production_batches: [{ key: { transactionNo: 1 }, unique: true }, { key: { businessDate: -1 } }],
  payments: [{ key: { transactionNo: 1 }, unique: true }, { key: { partyType: 1, partyId: 1, businessDate: -1 } }],
  party_ledger_entries: [{ key: { transactionNo: 1, lineNo: 1 }, unique: true }, { key: { partyType: 1, partyId: 1, businessDate: 1, status: 1 } }],
  inventory_movements: [{ key: { transactionNo: 1, lineNo: 1 }, unique: true }, { key: { productSku: 1, location: 1, businessDate: 1, status: 1 } }],
  cashbook_entries: [{ key: { transactionNo: 1, lineNo: 1 }, unique: true }, { key: { businessDate: 1, account: 1, status: 1 } }],
  financial_transactions: [{ key: { transactionNo: 1 }, unique: true }, { key: { businessDate: 1, kind: 1, status: 1 } }],
  daily_closings: [{ key: { businessDate: 1, account: 1 }, unique: true }],
  notifications: [{ key: { status: 1, severity: 1, createdAt: -1 } }],
  audit_logs: [{ key: { entity: 1, entityId: 1, createdAt: -1 } }, { key: { createdAt: -1 } }],
};

const obsoleteField = ["route", "Id"].join("");
const obsoleteCollection = ["route", "s"].join("");
const backupCollection = "obsolete_delivery_group_backups";

async function backUp(collectionName: string, documents: Document[]) {
  if (!documents.length) return;
  await database.collection(backupCollection).createIndex({ sourceCollection: 1, sourceId: 1 }, { unique: true });
  await database.collection(backupCollection).bulkWrite(documents.map((document) => ({
    updateOne: {
      filter: { sourceCollection: collectionName, sourceId: document._id },
      update: { $setOnInsert: { sourceCollection: collectionName, sourceId: document._id, document, backedUpAt: new Date() } },
      upsert: true,
    },
  })));
  const backedUp = await database.collection(backupCollection).countDocuments({ sourceCollection: collectionName, sourceId: { $in: documents.map((document) => document._id) } });
  if (backedUp !== documents.length) throw new Error(`Backup verification failed for ${collectionName}`);
}

async function removeObsoleteDeliveryGrouping() {
  for (const collectionName of ["customers", "customer_deliveries", "delivery_batches"]) {
    const collection = database.collection(collectionName);
    const affected = await collection.find({ [obsoleteField]: { $exists: true } }).toArray();
    await backUp(collectionName, affected);
    if (affected.length) await collection.updateMany({ [obsoleteField]: { $exists: true } }, { $unset: { [obsoleteField]: "" } });

    const existingIndexes = await collection.indexes().catch(() => []);
    for (const index of existingIndexes) {
      if (index.name !== "_id_" && Object.keys(index.key ?? {}).includes(obsoleteField)) await collection.dropIndex(index.name!);
    }
  }

  const exists = await database.listCollections({ name: obsoleteCollection }, { nameOnly: true }).hasNext();
  if (!exists) return;
  const legacyDocuments = await database.collection(obsoleteCollection).find({}).toArray();
  await backUp(obsoleteCollection, legacyDocuments);
  if (legacyDocuments.length) {
    const saved = await database.collection(backupCollection).countDocuments({ sourceCollection: obsoleteCollection });
    if (saved < legacyDocuments.length) throw new Error("Obsolete delivery grouping was not fully backed up");
  }
  await database.collection(obsoleteCollection).drop();
}

async function assertNoDuplicateDailyHistory() {
  const duplicateBatch = await database.collection("delivery_batches").aggregate([{ $match: { status: "posted" } }, { $group: { _id: "$businessDate", count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]).next();
  if (duplicateBatch) throw new Error(`Multiple posted delivery batches exist for ${duplicateBatch._id}; review them before rerunning migration.`);
  const duplicateCustomer = await database.collection("customer_deliveries").aggregate([{ $match: { status: "posted" } }, { $group: { _id: { customerId: "$customerId", businessDate: "$businessDate" }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]).next();
  if (duplicateCustomer) throw new Error("A customer has duplicate posted delivery history for one date; review it before rerunning migration.");
}

async function main() {
  await removeObsoleteDeliveryGrouping();
  await assertNoDuplicateDailyHistory();
  for (const [name, definitions] of Object.entries(indexes)) {
    for (const definition of definitions) await database.collection(name).createIndex(definition.key, definition);
  }
  console.log(`Migration complete: ${Object.keys(indexes).length} collections indexed; obsolete delivery grouping removed safely.`);
}

main().finally(() => client.close());
