import { db } from "@/lib/db";
import { addDays, karachiBusinessDate } from "@/lib/date-utils";
import { normalizePakistanPhone } from "@/lib/customer-statement";
import { formatCustomerAccountSummaryMessage, formatVendorAccountSummaryMessage, monthBounds } from "@/lib/customer-statement-calculations";
import { integerToBigInt } from "@/lib/money";
import { sendWhatsAppBroadcast } from "@/lib/services/whatsapp";

const rangeMatch = (from: string, to: string) => ({ businessDate: { $gte: from, $lt: addDays(to, 1) }, status: "posted" });

export async function POST(request: Request) {
  const url = new URL(request.url);
  const entity = url.searchParams.get("entity") === "vendors" ? "vendors" : "customers";
  const database = await db();
  const businessDate = karachiBusinessDate();
  const month = businessDate.slice(0, 7);
  const bounds = monthBounds(month);
  const from = bounds.start;
  const to = bounds.next;

  if (entity === "vendors") {
    const vendors = await database.collection("vendors").aggregate([
      { $match: { active: true } },
      { $sort: { name: 1 } },
      { $lookup: { from: "party_ledger_entries", let: { id: "$_id" }, pipeline: [
        { $match: { $expr: { $and: [{ $eq: ["$partyId", "$$id"] }, { $eq: ["$partyType", "vendor"] }, { $eq: ["$status", "posted"] }] } } },
        { $group: { _id: null, balance: { $sum: { $subtract: ["$creditPaisa", "$debitPaisa"] } }, procurementAmount: { $sum: "$creditPaisa" }, paidAmount: { $sum: "$debitPaisa" } } },
      ], as: "ledger" } },
      { $lookup: { from: "milk_purchases", let: { id: "$_id" }, pipeline: [
        { $match: { ...rangeMatch(from, to), $expr: { $eq: ["$vendorId", "$$id"] } } },
        { $group: { _id: null, entries: { $sum: 1 }, quantityMilli: { $sum: "$quantityMilli" }, amountPaisa: { $sum: "$amountPaisa" } } },
      ], as: "periodProcurement" } },
      { $lookup: { from: "payments", let: { id: "$_id" }, pipeline: [
        { $match: { ...rangeMatch(from, to), partyType: "vendor", $expr: { $eq: ["$partyId", "$$id"] } } },
        { $group: { _id: null, payments: { $sum: 1 }, amountPaisa: { $sum: "$amountPaisa" } } },
      ], as: "periodPayments" } },
      { $project: {
        name: 1,
        code: 1,
        phone: 1,
        whatsapp: 1,
        active: 1,
        payable: { $ifNull: [{ $first: "$ledger.balance" }, 0] },
        allProcurement: { $ifNull: [{ $first: "$ledger.procurementAmount" }, 0] },
        allPaid: { $ifNull: [{ $first: "$ledger.paidAmount" }, 0] },
        periodEntries: { $ifNull: [{ $first: "$periodProcurement.entries" }, 0] },
        periodQuantityMilli: { $ifNull: [{ $first: "$periodProcurement.quantityMilli" }, 0] },
        periodProcurementPaisa: { $ifNull: [{ $first: "$periodProcurement.amountPaisa" }, 0] },
        periodPayments: { $ifNull: [{ $first: "$periodPayments.payments" }, 0] },
        periodPaidPaisa: { $ifNull: [{ $first: "$periodPayments.amountPaisa" }, 0] },
      } },
    ]).toArray();

    const recipients = vendors.map((vendor) => {
      const payable = integerToBigInt(vendor.payable);
      const periodProcurementPaisa = integerToBigInt(vendor.periodProcurementPaisa);
      const periodPaidPaisa = integerToBigInt(vendor.periodPaidPaisa);
      const previousOutstanding = payable - periodProcurementPaisa + periodPaidPaisa;
      const phone = normalizePakistanPhone(String(vendor.whatsapp ?? vendor.phone ?? ""));
      return {
        id: String(vendor._id),
        name: String(vendor.name),
        phone,
        message: formatVendorAccountSummaryMessage({
          vendorName: String(vendor.name),
          date: businessDate,
          todayMilkQuantityMilli: integerToBigInt(vendor.periodQuantityMilli),
          todayProcurementAmountPaisa: periodProcurementPaisa,
          previousOutstandingPaisa: previousOutstanding,
          totalProcurementValuePaisa: integerToBigInt(vendor.allProcurement),
          totalPaymentsReceivedPaisa: integerToBigInt(vendor.allPaid),
          currentRemainingPayablePaisa: payable,
        }),
      };
    });

    return Response.json(await sendWhatsAppBroadcast({ entity, recipients }));
  }

  const customers = await database.collection("customers").aggregate([
    { $match: { customerType: "household", active: true } },
    { $sort: { deliverySequence: 1, name: 1 } },
    { $lookup: { from: "party_ledger_entries", let: { id: "$_id" }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ["$partyId", "$$id"] }, { $eq: ["$partyType", "customer"] }, { $eq: ["$status", "posted"] }] } } },
      { $group: { _id: null, debit: { $sum: "$debitPaisa" }, credit: { $sum: "$creditPaisa" }, monthDebit: { $sum: { $cond: [{ $and: [{ $gte: ["$businessDate", from] }, { $lt: ["$businessDate", addDays(to, 1)] }] }, "$debitPaisa", 0] } }, monthCredit: { $sum: { $cond: [{ $and: [{ $gte: ["$businessDate", from] }, { $lt: ["$businessDate", addDays(to, 1)] }] }, "$creditPaisa", 0] } } } },
    ], as: "ledger" } },
    { $lookup: { from: "customer_deliveries", let: { id: "$_id" }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ["$customerId", "$$id"] }, { $eq: ["$status", "posted"] }, { $gte: ["$businessDate", from] }, { $lt: ["$businessDate", addDays(to, 1)] }] } } },
      { $group: { _id: null, milk: { $sum: "$milkQuantityMilli" }, charges: { $sum: "$amountPaisa" } } },
    ], as: "deliveries" } },
    { $project: { name: 1, phone: 1, whatsapp: 1, active: 1, defaultQuantityMilli: 1, ledger: 1, deliveries: 1 } },
  ]).toArray();

  const recipients = customers.map((customer) => {
    const ledger = customer.ledger?.[0] ?? {};
    const delivery = customer.deliveries?.[0] ?? {};
    const balance = integerToBigInt(ledger.debit) - integerToBigInt(ledger.credit);
    const currentPeriodCharges = integerToBigInt(ledger.monthDebit);
    const currentPeriodPayments = integerToBigInt(ledger.monthCredit);
    const previousOutstanding = balance - currentPeriodCharges + currentPeriodPayments;
    const phone = normalizePakistanPhone(String(customer.whatsapp ?? customer.phone ?? ""));
    return {
      id: String(customer._id),
      name: String(customer.name),
      phone,
      message: formatCustomerAccountSummaryMessage({
        customerName: String(customer.name),
        date: businessDate,
        todayMilkQuantityMilli: integerToBigInt(delivery.milk),
        todayChargesPaisa: integerToBigInt(delivery.charges),
        previousOutstandingPaisa: previousOutstanding,
        totalChargesPaisa: integerToBigInt(ledger.debit),
        totalPaymentsPaisa: integerToBigInt(ledger.credit),
        currentOutstandingPaisa: balance,
      }),
    };
  });

  return Response.json(await sendWhatsAppBroadcast({ entity, recipients }));
}
