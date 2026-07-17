import { MongoClient, type IndexDescription } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true");
const database = client.db(process.env.MONGODB_DB ?? "dairyflow");

const indexes: Record<string, IndexDescription[]> = {
  users: [{ key: { email: 1 }, unique: true }],
  sessions: [{ key: { sessionId: 1 }, unique: true }, { key: { expiresAt: 1 }, expireAfterSeconds: 0 }, { key: { userId: 1, revokedAt: 1 } }],
  login_attempts: [{ key: { createdAt: 1 }, expireAfterSeconds: 86_400 }, { key: { email: 1, createdAt: -1 } }, { key: { fingerprint: 1, createdAt: -1 } }],
  idempotency_records: [{ key: { key: 1 }, unique: true }, { key: { createdAt: 1 }, expireAfterSeconds: 2_592_000 }],
  vendors: [{ key: { code: 1 }, unique: true }, { key: { active: 1, name: 1 } }, { key: { phone: 1 } }],
  vendor_rate_history: [{ key: { vendorId: 1, effectiveFrom: -1 } }],
  customers: [{ key: { code: 1 }, unique: true }, { key: { active: 1, name: 1 } }, { key: { phone: 1 } }, { key: { routeId: 1, deliveryOrder: 1 } }],
  customer_rate_history: [{ key: { customerId: 1, effectiveFrom: -1 } }],
  routes: [{ key: { code: 1 }, unique: true }, { key: { active: 1, name: 1 } }],
  products: [{ key: { sku: 1 }, unique: true }, { key: { active: 1, name: 1 } }],
  procurement_batches: [{ key: { transactionNo: 1 }, unique: true }, { key: { businessDate: -1, shift: 1 } }],
  milk_purchases: [{ key: { transactionNo: 1, lineNo: 1 }, unique: true }, { key: { vendorId: 1, businessDate: 1, shift: 1 }, unique: true, partialFilterExpression: { status: "posted" } }],
  delivery_batches: [{ key: { transactionNo: 1 }, unique: true }, { key: { routeId: 1, businessDate: 1 }, unique: true, partialFilterExpression: { status: "posted" } }],
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

async function main() {
  for (const [name, definitions] of Object.entries(indexes)) {
    const collection = database.collection(name);
    for (const definition of definitions) await collection.createIndex(definition.key, definition);
  }
  console.log(`Migration complete: ${Object.keys(indexes).length} collections indexed.`);
}

main().finally(() => client.close());
