import "server-only";
import { MongoClient, type Db } from "mongodb";
import { env } from "./env";
const globalMongo=globalThis as typeof globalThis & {mongo?:Promise<MongoClient>};
const clientPromise=globalMongo.mongo??new MongoClient(env.MONGODB_URI,{maxPoolSize:20}).connect();
if(process.env.NODE_ENV!=="production") globalMongo.mongo=clientPromise;
export async function db():Promise<Db>{return (await clientPromise).db(env.MONGODB_DB)}
export async function transaction<T>(fn:(database:Db,session:import("mongodb").ClientSession)=>Promise<T>){const client=await clientPromise;const session=client.startSession();try{return await session.withTransaction(()=>fn(client.db(env.MONGODB_DB),session),{readConcern:{level:"snapshot"},writeConcern:{w:"majority"}})}finally{await session.endSession()}}
