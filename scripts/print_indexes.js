const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true';
const dbName = process.env.MONGODB_DB || 'dairyflow';
(async () => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const receipts = await db.collection('inventory_receipts').indexes();
    const idempotency = await db.collection('idempotency_records').indexes();
    console.log('inventory_receipts indexes:', JSON.stringify(receipts, null, 2));
    console.log('idempotency_records indexes:', JSON.stringify(idempotency, null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
