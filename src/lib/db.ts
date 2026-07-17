import "server-only";

import { MongoClient, type ClientSession, type Db } from "mongodb";
import { env } from "./env";
import { logServerError } from "./logger";

const globalMongo = globalThis as typeof globalThis & { mongo?: Promise<MongoClient> };

function client(): Promise<MongoClient> {
  if (globalMongo.mongo) return globalMongo.mongo;

  const mongo = new MongoClient(env.MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 20_000,
    retryReads: true,
    retryWrites: true,
  });

  // Attach the rejection handler before exposing the promise. This prevents a
  // deferred connection failure from becoming an unhandled process rejection.
  const connection = mongo.connect().catch(async (error) => {
    if (globalMongo.mongo === connection) delete globalMongo.mongo;
    await mongo.close().catch(() => undefined);
    logServerError("mongodb.connection_failed", error, { database: env.MONGODB_DB });
    throw error;
  });
  globalMongo.mongo = connection;
  return connection;
}

export async function db(): Promise<Db> {
  return (await client()).db(env.MONGODB_DB);
}

export async function transaction<T>(fn: (database: Db, session: ClientSession) => Promise<T>) {
  const mongo = await client();
  const session = mongo.startSession();
  try {
    return await session.withTransaction(
      () => fn(mongo.db(env.MONGODB_DB), session),
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } finally {
    await session.endSession();
  }
}
