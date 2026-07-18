"use server";

import argon2 from "argon2";
import { Long } from "mongodb";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { roles, type Role } from "@/lib/types";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
});

export type LoginState = { error?: string };

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email address and password." };

  let database;
  try { database = await db(); await database.command({ ping: 1 }); } catch { return { error: "DairyFlow cannot reach the database. Ask the owner to check the database settings." }; }

  const userCount = await database.collection("users").countDocuments();
  if (userCount === 0) {
    const passwordHash = await argon2.hash(env.SEED_OWNER_PASSWORD, { type: argon2.argon2id });
    await database.collection("users").insertOne({
      email: env.SEED_OWNER_EMAIL,
      name: env.SEED_OWNER_NAME,
      passwordHash,
      role: "owner",
      active: true,
      sessionVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await database.collection("products").bulkWrite([
      { updateOne: { filter: { sku: "MILK-001" }, update: { $setOnInsert: { sku: "MILK-001", name: "Fresh Milk", unit: "liter", category: "dairy", retailRatePaisa: Long.fromNumber(20000), stockMilli: Long.ZERO, averageCostPaisa: Long.ZERO, lowStockMilli: Long.fromNumber(5000), active: true, inventoryManaged: true, allowManualStockReceipt: false, sellable: true, availableInDailyDelivery: false, internalOnly: false, stockSource: "vendor-procurement", createdAt: new Date(), updatedAt: new Date() } }, upsert: true } },
      { updateOne: { filter: { sku: "YOG-001" }, update: { $setOnInsert: { sku: "YOG-001", name: "Yogurt / Dahi", unit: "kilogram", category: "dairy", retailRatePaisa: Long.fromNumber(24000), stockMilli: Long.ZERO, averageCostPaisa: Long.ZERO, lowStockMilli: Long.fromNumber(5000), active: true, inventoryManaged: true, allowManualStockReceipt: false, sellable: true, availableInDailyDelivery: true, internalOnly: false, stockSource: "yogurt-production", createdAt: new Date(), updatedAt: new Date() } }, upsert: true } },
      { updateOne: { filter: { sku: "BREAD-001" }, update: { $setOnInsert: { sku: "BREAD-001", name: "Bread Packets", unit: "packet", category: "retail", retailRatePaisa: Long.ZERO, stockMilli: Long.ZERO, averageCostPaisa: Long.ZERO, lowStockMilli: Long.ZERO, active: true, inventoryManaged: true, allowManualStockReceipt: true, sellable: true, availableInDailyDelivery: true, internalOnly: false, stockSource: "inventory-receipt", createdAt: new Date(), updatedAt: new Date() } }, upsert: true } },
      { updateOne: { filter: { sku: "EGG-001" }, update: { $setOnInsert: { sku: "EGG-001", name: "Eggs", unit: "piece", category: "retail", retailRatePaisa: Long.ZERO, stockMilli: Long.ZERO, averageCostPaisa: Long.ZERO, lowStockMilli: Long.ZERO, active: true, inventoryManaged: true, allowManualStockReceipt: true, sellable: true, availableInDailyDelivery: true, internalOnly: false, stockSource: "inventory-receipt", baseUnit: "piece", purchaseUnit: "tray", saleUnits: ["piece", "tray"], piecesPerTray: 30, defaultSaleUnit: "piece", pieceSellingRatePaisa: 0, traySellingRatePaisa: 0, eggInventoryUnitVersion: 2, createdAt: new Date(), updatedAt: new Date() } }, upsert: true } },
      { updateOne: { filter: { sku: "ISPAGHOL-001" }, update: { $setOnInsert: { sku: "ISPAGHOL-001", name: "Ispaghol Husk Packets", unit: "packet", category: "retail", retailRatePaisa: Long.ZERO, stockMilli: Long.ZERO, averageCostPaisa: Long.ZERO, lowStockMilli: Long.ZERO, active: true, inventoryManaged: true, allowManualStockReceipt: true, sellable: true, availableInDailyDelivery: true, internalOnly: false, stockSource: "inventory-receipt", createdAt: new Date(), updatedAt: new Date() } }, upsert: true } },
      { updateOne: { filter: { sku: "KUNDA-001" }, update: { $setOnInsert: { sku: "KUNDA-001", name: "Kunda Dahi", unit: "pot", category: "internal", retailRatePaisa: Long.ZERO, stockMilli: Long.ZERO, averageCostPaisa: Long.ZERO, active: true, inventoryManaged: false, allowManualStockReceipt: false, sellable: false, availableInDailyDelivery: false, internalOnly: true, createdAt: new Date(), updatedAt: new Date() } }, upsert: true } },
    ]);
    await database.collection("business_settings").updateOne(
      { _id: "default" as never },
      { $setOnInsert: { businessName: "DairyFlow Milk & Yogurt", currency: "PKR", timezone: "Asia/Karachi", invoicePrefix: "DF", costingMethod: "moving-weighted-average", yogurtAutomaticMilkRatioParts: 40, yogurtAutomaticOutputRatioParts: 34, yogurtAutomaticYieldMilli: 850, yogurtAutomaticLossMilli: 150, yogurtYieldToleranceMilli: 20, yogurtDefaultProductionMode: "automatic", yogurtMilkInputUnit: "kilogram", milkInventoryUnit: "liter", customerRatePaisa: 15000, allowedBackdateDays: 3, createdAt: new Date(), updatedAt: new Date() } },
      { upsert: true },
    );
  }

  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const fingerprint = `${forwarded ?? requestHeaders.get("x-real-ip") ?? "local"}:${(requestHeaders.get("user-agent") ?? "unknown").slice(0, 120)}`;
  const windowStart = new Date(Date.now() - 15 * 60 * 1000);
  const [emailFailures, fingerprintFailures] = await Promise.all([database.collection("login_attempts").countDocuments({
    email: parsed.data.email,
    successful: false,
    createdAt: { $gte: windowStart },
  }), database.collection("login_attempts").countDocuments({ fingerprint, successful: false, createdAt: { $gte: windowStart } })]);
  if (emailFailures >= 10 || fingerprintFailures >= 20) return { error: "Too many attempts from this device. Try again in 15 minutes." };

  const user = await database.collection("users").findOne({ email: parsed.data.email });
  const valid = Boolean(user?.active && user.passwordHash && await argon2.verify(String(user.passwordHash), parsed.data.password));
  await database.collection("login_attempts").insertOne({
    email: parsed.data.email,
    userId: user?._id ?? null,
    fingerprint,
    successful: valid,
    createdAt: new Date(),
  });

  if (!valid || !user || !roles.includes(user.role)) return { error: "Invalid email or password." };

  await database.collection("users").updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await database.collection("audit_logs").insertOne({
    actorId: user._id,
    action: "login",
    entity: "session",
    entityId: null,
    createdAt: new Date(),
  });
  await createSession({
    _id: user._id,
    sessionVersion: Number(user.sessionVersion),
    name: String(user.name),
    email: String(user.email),
    role: user.role as Role,
  });
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
