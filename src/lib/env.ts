import { z } from "zod";
const schema=z.object({MONGODB_URI:z.string().default("mongodb://localhost:27017/?replicaSet=rs0&directConnection=true"),MONGODB_DB:z.string().default("dairyflow"),SESSION_SECRET:z.string().min(32).default("development-only-secret-change-me-123456"),APP_URL:z.string().url().default("http://localhost:3000")});
export const env=schema.parse(process.env);
