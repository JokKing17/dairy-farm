const { MongoClient } = require('mongodb');

const key = process.argv[2];
if (!key) {
  console.error('Usage: node scripts/find_receipt.js <idempotencyKey>');
  process.exit(2);
}

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true';
const dbName = process.env.MONGODB_DB || 'dairyflow';

(async () => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const idemp = await db.collection('idempotency_records').findOne({ key });
    const receipt = await db.collection('inventory_receipts').findOne({ idempotencyKey: key });
    console.log(JSON.stringify({ idempotency: idemp, receipt }, null, 2));
  } catch (err) {
    console.error('ERROR', err && err.message ? err.message : String(err));
    process.exit(3);
  } finally {
    await client.close();
  }
})();
