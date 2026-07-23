import { z } from "zod";

const knownWeakSecrets = new Set([
  "development-only-secret-change-me-123456",
  "replace-with-at-least-32-random-characters",
  "changeme",
]);

const optionalR2 = z.string().trim().optional().transform((value) => value || undefined);

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    MONGODB_URI: z.string().min(1).default("mongodb://localhost:27017/?replicaSet=rs0&directConnection=true"),
    MONGODB_DB: z.string().min(1).default("dairyflow"),
    SESSION_SECRET: z.string().min(32).optional(),
    APP_URL: z.url().default("http://localhost:3000"),
    R2_ENDPOINT: optionalR2,
    R2_ACCESS_KEY_ID: optionalR2,
    R2_SECRET_ACCESS_KEY: optionalR2,
    R2_BUCKET: optionalR2,
    R2_PUBLIC_URL: optionalR2,
    WHATSAPP_API_TOKEN: optionalR2,
    WHATSAPP_PHONE_NUMBER_ID: optionalR2,
    WHATSAPP_API_VERSION: z.string().trim().default("v22.0"),
    SEED_OWNER_EMAIL: z.string().email().trim().toLowerCase().default("owner@example.com"),
    SEED_OWNER_PASSWORD: z.string().min(8).default("changeme123!"),
    SEED_OWNER_NAME: z.string().trim().default("Business Owner"),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && (!value.SESSION_SECRET || knownWeakSecrets.has(value.SESSION_SECRET.toLowerCase()))) {
      context.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "A strong SESSION_SECRET is required in production" });
    }
    const r2Values = [value.R2_ENDPOINT, value.R2_ACCESS_KEY_ID, value.R2_SECRET_ACCESS_KEY, value.R2_BUCKET];
    const configuredCount = r2Values.filter(Boolean).length;
    if (configuredCount !== 0 && configuredCount !== r2Values.length) {
      context.addIssue({ code: "custom", path: ["R2_ENDPOINT"], message: "R2 configuration must be complete or entirely omitted" });
    }
  });

const parsed = schema.parse(process.env);

export const env = {
  ...parsed,
  SESSION_SECRET: parsed.SESSION_SECRET ?? "development-only-secret-change-me-123456",
  R2_ENABLED: Boolean(parsed.R2_ENDPOINT),
  SEED_OWNER_EMAIL: parsed.SEED_OWNER_EMAIL,
  SEED_OWNER_PASSWORD: parsed.SEED_OWNER_PASSWORD,
  SEED_OWNER_NAME: parsed.SEED_OWNER_NAME,
};
