import { db } from "./db";

export function karachiBusinessDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export async function dashboard() {
  const database = await db();
  const businessDate = karachiBusinessDate();
  const [purchases, sales, expenses, receivables, payables, alerts, milkFlow] = await Promise.all([
    database.collection("milk_purchases").aggregate([{ $match: { businessDate, status: "posted" } }, { $group: { _id: null, quantity: { $sum: "$quantityMilli" }, amount: { $sum: "$amountPaisa" } } }]).next(),
    database.collection("financial_transactions").aggregate([{ $match: { businessDate, kind: { $in: ["sale", "customer_delivery"] }, status: "posted" } }, { $group: { _id: null, amount: { $sum: "$amountPaisa" } } }]).next(),
    database.collection("expenses").aggregate([{ $match: { businessDate, status: "posted" } }, { $group: { _id: null, amount: { $sum: "$amountPaisa" } } }]).next(),
    database.collection("party_ledger_entries").aggregate([{ $match: { partyType: "customer", status: "posted" } }, { $group: { _id: null, balance: { $sum: { $subtract: ["$debitPaisa", "$creditPaisa"] } } } }]).next(),
    database.collection("party_ledger_entries").aggregate([{ $match: { partyType: "vendor", status: "posted" } }, { $group: { _id: null, balance: { $sum: { $subtract: ["$creditPaisa", "$debitPaisa"] } } } }]).next(),
    database.collection("notifications").find({ status: "open" }).sort({ createdAt: -1 }).limit(5).project({ title: 1, message: 1, severity: 1 }).toArray(),
    database.collection("inventory_movements").aggregate([{ $match: { businessDate, status: "posted", productSku: "MILK-001" } }, { $group: { _id: "$type", quantity: { $sum: "$quantityMilli" } } }, { $sort: { _id: 1 } }]).toArray(),
  ]);
  return { businessDate, purchases, sales, expenses, receivables, payables, alerts, milkFlow, refreshedAt: new Date() };
}
