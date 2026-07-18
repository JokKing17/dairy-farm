import type { ClientSession, Db } from "mongodb";
import { integerToBigInt } from "../money";

export type NotificationCategory =
  | "vendor"
  | "milk_procurement"
  | "inventory"
  | "low_stock"
  | "household_deliveries"
  | "shop_sales"
  | "credit_customers"
  | "vendor_payments"
  | "customer_payments"
  | "expenses"
  | "system";

export type NotificationPriority = "low" | "medium" | "high" | "critical";

export type NotificationInput = {
  title: string;
  message: string;
  category: NotificationCategory;
  priority?: NotificationPriority;
  severity?: "success" | "info" | "warning" | "danger";
  relatedType?: string;
  relatedId?: unknown;
  relatedHref?: string;
  metadata?: Record<string, unknown>;
};

export async function createNotification(database: Db, input: NotificationInput, actorId: string, session?: ClientSession) {
  const now = new Date();
  await database.collection("notifications").insertOne({
    title: input.title,
    message: input.message,
    category: input.category,
    priority: input.priority ?? "medium",
    severity: input.severity ?? (input.priority === "critical" ? "danger" : input.priority === "high" ? "warning" : "info"),
    status: "open",
    readAt: null,
    relatedType: input.relatedType ?? null,
    relatedId: input.relatedId ?? null,
    relatedHref: input.relatedHref ?? null,
    metadata: input.metadata ?? {},
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
  }, session ? { session } : undefined);
}

export async function createLowStockNotifications(database: Db, productSkus: string[], actorId: string, session?: ClientSession) {
  const uniqueSkus = [...new Set(productSkus)];
  if (!uniqueSkus.length) return;
  const products = await database.collection("products").find({ sku: { $in: uniqueSkus }, active: true, inventoryManaged: true }, session ? { session } : undefined).toArray();
  const todayKey = new Date().toISOString().slice(0, 10);
  for (const product of products) {
    const stockMilli = integerToBigInt(product.stockMilli);
    const lowStockMilli = integerToBigInt(product.lowStockMilli);
    if (lowStockMilli <= 0n || stockMilli > lowStockMilli) continue;
    const lowStockKey = `${todayKey}:${String(product.sku)}`;
    const existing = await database.collection("notifications").findOne({ "metadata.lowStockKey": lowStockKey }, session ? { session } : undefined);
    if (existing) continue;
    await createNotification(database, {
      title: `${String(product.name)} stock is low`,
      message: `Current stock is ${(Number(stockMilli) / 1000).toLocaleString()} ${String(product.unit ?? "units")}. Review inventory before more sales.`,
      category: "low_stock",
      priority: "critical",
      severity: "danger",
      relatedType: "product",
      relatedId: product._id,
      relatedHref: "/inventory",
      metadata: { lowStockKey, sku: product.sku, stockMilli: stockMilli.toString(), lowStockMilli: lowStockMilli.toString() },
    }, actorId, session);
  }
}
