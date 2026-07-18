import { db } from "./db";
import { businessDateFilter, karachiBusinessDate } from "./date-utils";

export { karachiBusinessDate };

export async function dashboard(from?: string, to?: string) {
  const database = await db();
  const businessDate = from ?? karachiBusinessDate();
  const dateMatch = businessDateFilter(from, to) ?? { businessDate };
  const [purchases, sales, expenses, receivables, payables, alerts, milkFlow, deliveryProgress, expectedMilk] = await Promise.all([
    database.collection("milk_purchases").aggregate([{ $match: { ...dateMatch, status: "posted" } }, { $group: { _id: null, quantity: { $sum: "$quantityMilli" }, amount: { $sum: "$amountPaisa" } } }]).next(),
    database.collection("financial_transactions").aggregate([{ $match: { ...dateMatch, kind: { $in: ["sale", "customer_delivery"] }, status: "posted" } }, { $group: { _id: null, amount: { $sum: "$amountPaisa" } } }]).next(),
    database.collection("expenses").aggregate([{ $match: { ...dateMatch, status: "posted" } }, { $group: { _id: null, amount: { $sum: "$amountPaisa" } } }]).next(),
    database.collection("party_ledger_entries").aggregate([{ $match: { partyType: "customer", status: "posted" } }, { $group: { _id: null, balance: { $sum: { $subtract: ["$debitPaisa", "$creditPaisa"] } } } }]).next(),
    database.collection("party_ledger_entries").aggregate([{ $match: { partyType: "vendor", status: "posted" } }, { $group: { _id: null, balance: { $sum: { $subtract: ["$creditPaisa", "$debitPaisa"] } } } }]).next(),
    database.collection("notifications").find({ status: "open" }).sort({ createdAt: -1 }).limit(5).project({ title: 1, message: 1, severity: 1 }).toArray(),
    database.collection("inventory_movements").aggregate([{ $match: { ...dateMatch, status: "posted", productSku: "MILK-001" } }, { $group: { _id: "$type", quantity: { $sum: "$quantityMilli" } } }, { $sort: { _id: 1 } }]).toArray(),
    database.collection("customer_deliveries").aggregate([{ $match: { ...dateMatch, status: "posted" } }, { $group: { _id: null, completed: { $sum: 1 }, delivered: { $sum: { $cond: [{ $in: ["$deliveryStatus", ["skipped", "paused"]] }, 0, 1] } }, skipped: { $sum: { $cond: [{ $in: ["$deliveryStatus", ["skipped", "paused"]] }, 1, 0] } }, milk: { $sum: "$milkQuantityMilli" } } }]).next(),
    database.collection("customers").aggregate([{ $match: { active: true, customerType: "household", paused: { $ne: true } } }, { $group: { _id: null, customers: { $sum: 1 }, milk: { $sum: "$defaultQuantityMilli" } } }]).next(),
  ]);
  return { businessDate, purchases, sales, expenses, receivables, payables, alerts, milkFlow, deliveryProgress, expectedMilk, refreshedAt: new Date() };
}
