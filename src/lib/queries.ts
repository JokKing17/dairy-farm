import { db } from "./db";
import { businessDateFilter, karachiBusinessDate } from "./date-utils";

export { karachiBusinessDate };

const REVENUE_KINDS = ["sale", "shop_cash_sale", "shop_credit_sale", "shop_sale_reversal", "customer_delivery", "customer_delivery_reversal"];

export async function dashboard(from?: string, to?: string) {
  const database = await db();
  const businessDate = from ?? karachiBusinessDate();
  const dateMatch = businessDateFilter(from, to) ?? { businessDate };
  const [purchases, sales, expenses, customerPayments, receivables, payables, alerts, milkFlow, deliveryProgress, expectedMilk, dailySales, dailyPurchases, dailyExpenses, dailyCustomerPayments, customerBalances, vendorBalances, revenueComposition, expenseCategories, stock, production] = await Promise.all([
    database.collection("milk_purchases").aggregate([{ $match: { ...dateMatch, status: "posted" } }, { $group: { _id: null, quantity: { $sum: "$quantityMilli" }, amount: { $sum: "$amountPaisa" } } }]).next(),
    database.collection("financial_transactions").aggregate([{ $match: { ...dateMatch, kind: { $in: REVENUE_KINDS }, status: "posted" } }, { $group: { _id: null, amount: { $sum: "$amountPaisa" } } }]).next(),
    database.collection("expenses").aggregate([{ $match: { ...dateMatch, status: "posted" } }, { $group: { _id: null, amount: { $sum: "$amountPaisa" } } }]).next(),
    database.collection("payments").aggregate([{ $match: { ...dateMatch, partyType: "customer", status: "posted" } }, { $group: { _id: null, amount: { $sum: "$amountPaisa" }, count: { $sum: 1 } } }]).next(),
    database.collection("party_ledger_entries").aggregate([{ $match: { partyType: "customer", status: "posted" } }, { $group: { _id: null, balance: { $sum: { $subtract: ["$debitPaisa", "$creditPaisa"] } } } }]).next(),
    database.collection("party_ledger_entries").aggregate([{ $match: { partyType: "vendor", status: "posted" } }, { $group: { _id: null, balance: { $sum: { $subtract: ["$creditPaisa", "$debitPaisa"] } } } }]).next(),
    database.collection("notifications").find({ status: "open" }).sort({ createdAt: -1 }).limit(5).project({ title: 1, message: 1, severity: 1 }).toArray(),
    database.collection("inventory_movements").aggregate([{ $match: { ...dateMatch, status: "posted", productSku: "MILK-001" } }, { $group: { _id: "$type", quantity: { $sum: "$quantityMilli" } } }, { $sort: { _id: 1 } }]).toArray(),
    database.collection("customer_deliveries").aggregate([{ $match: { ...dateMatch, status: "posted" } }, { $group: { _id: null, completed: { $sum: 1 }, delivered: { $sum: { $cond: [{ $in: ["$deliveryStatus", ["skipped", "paused"]] }, 0, 1] } }, skipped: { $sum: { $cond: [{ $in: ["$deliveryStatus", ["skipped", "paused"]] }, 1, 0] } }, milk: { $sum: "$milkQuantityMilli" } } }]).next(),
    database.collection("customers").aggregate([{ $match: { active: true, customerType: "household", paused: { $ne: true } } }, { $group: { _id: null, customers: { $sum: 1 }, milk: { $sum: "$defaultQuantityMilli" } } }]).next(),
    database.collection("financial_transactions").aggregate([{ $match: { ...dateMatch, kind: { $in: REVENUE_KINDS }, status: "posted" } }, { $group: { _id: "$businessDate", amount: { $sum: "$amountPaisa" } } }, { $sort: { _id: 1 } }]).toArray(),
    database.collection("milk_purchases").aggregate([{ $match: { ...dateMatch, status: "posted" } }, { $group: { _id: "$businessDate", quantity: { $sum: "$quantityMilli" }, amount: { $sum: "$amountPaisa" } } }, { $sort: { _id: 1 } }]).toArray(),
    database.collection("expenses").aggregate([{ $match: { ...dateMatch, status: "posted" } }, { $group: { _id: "$businessDate", amount: { $sum: "$amountPaisa" } } }, { $sort: { _id: 1 } }]).toArray(),
    database.collection("payments").aggregate([{ $match: { ...dateMatch, partyType: "customer", status: "posted" } }, { $group: { _id: "$businessDate", amount: { $sum: "$amountPaisa" }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
    database.collection("party_ledger_entries").aggregate([{ $match: { partyType: "customer", status: "posted" } }, { $group: { _id: "$partyId", balance: { $sum: { $subtract: ["$debitPaisa", "$creditPaisa"] } } } }, { $match: { balance: { $gt: 0 } } }, { $sort: { balance: -1 } }, { $limit: 5 }, { $lookup: { from: "customers", localField: "_id", foreignField: "_id", as: "party" } }, { $project: { balance: 1, name: { $ifNull: [{ $first: "$party.name" }, "Customer"] } } }]).toArray(),
    database.collection("party_ledger_entries").aggregate([{ $match: { partyType: "vendor", status: "posted" } }, { $group: { _id: "$partyId", balance: { $sum: { $subtract: ["$creditPaisa", "$debitPaisa"] } }, quantity: { $sum: "$quantityMilli" } } }, { $match: { balance: { $gt: 0 } } }, { $sort: { balance: -1 } }, { $limit: 5 }, { $lookup: { from: "vendors", localField: "_id", foreignField: "_id", as: "party" } }, { $project: { balance: 1, quantity: 1, name: { $ifNull: [{ $first: "$party.name" }, "Vendor"] } } }]).toArray(),
    database.collection("financial_transactions").aggregate([{ $match: { ...dateMatch, kind: { $in: REVENUE_KINDS }, status: "posted" } }, { $group: { _id: "$kind", amount: { $sum: "$amountPaisa" } } }]).toArray(),
    database.collection("expenses").aggregate([{ $match: { ...dateMatch, status: "posted" } }, { $group: { _id: "$category", amount: { $sum: "$amountPaisa" } } }, { $sort: { amount: -1 } }]).toArray(),
    database.collection("inventory_movements").aggregate([{ $match: { status: "posted" } }, { $group: { _id: "$productSku", quantity: { $sum: "$quantityMilli" }, value: { $sum: "$inventoryValueChangePaisa" } } }, { $lookup: { from: "products", localField: "_id", foreignField: "sku", as: "product" } }, { $project: { quantity: 1, value: 1, name: { $ifNull: [{ $first: "$product.name" }, "$_id"] } } }, { $sort: { name: 1 } }]).toArray(),
    database.collection("production_batches").aggregate([{ $match: { ...dateMatch, status: "posted" } }, { $group: { _id: "$businessDate", milk: { $sum: { $ifNull: ["$actualMilkUsedMilli", "$milkUsedMilli"] } }, output: { $sum: { $ifNull: ["$actualYogurtOutputMilli", "$actualOutputMilli"] } }, loss: { $sum: "$processingLossMilli" }, cost: { $sum: "$totalProductionCostPaisa" }, profit: { $sum: "$estimatedGrossProfitPaisa" } } }, { $sort: { _id: 1 } }]).toArray(),
  ]);
  return { businessDate, purchases, sales, expenses, customerPayments, receivables, payables, alerts, milkFlow, deliveryProgress, expectedMilk, dailySales, dailyPurchases, dailyExpenses, dailyCustomerPayments, customerBalances, vendorBalances, revenueComposition, expenseCategories, stock, production, refreshedAt: new Date() };
}
