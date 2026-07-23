import { ClearSearch } from "@/components/clear-search";
import { DateFilter } from "@/components/date-filter";
import { DataTableContainer, EmptyState, FilterToolbar, MetricCard, PageHeader, SearchField, SectionHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { addDays, karachiBusinessDate } from "@/lib/date-utils";
import { normalizePakistanPhone } from "@/lib/customer-statement";
import { formatVendorAccountSummaryMessage } from "@/lib/customer-statement-calculations";
import { formatMilli, formatPKR, integerToBigInt } from "@/lib/money";
import { escapedSearchPattern, normalizeSearchQuery } from "@/lib/search";
import { VendorActions, VendorForm, VendorPaymentForm } from "./vendor-form";

export const dynamic = "force-dynamic";

const paisaInput = (value: unknown) => String(Number(integerToBigInt(value)) / 100);
const rangeMatch = (from: string, to: string) => ({ businessDate: { $gte: from, $lt: addDays(to, 1) }, status: "posted" });

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; q?: string }> }) {
  const { from: rawFrom, to: rawTo, q: rawQuery } = await searchParams;
  const today = karachiBusinessDate();
  const from = rawFrom ?? today;
  const to = rawTo ?? today;
  const q = normalizeSearchQuery(rawQuery);
  const searchPattern = escapedSearchPattern(q);
  const database = await db();

  const vendorMatch = searchPattern ? { $or: ["name", "code", "phone"].map((field) => ({ [field]: searchPattern })) } : {};
  const [vendors, procurementTotals, paymentTotals, outstandingTotal, paymentHistory] = await Promise.all([
    database.collection("vendors").aggregate([
      { $match: vendorMatch },
      { $sort: { name: 1 } },
      { $limit: 100 },
      { $lookup: { from: "party_ledger_entries", let: { id: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$partyId", "$$id"] }, { $eq: ["$partyType", "vendor"] }, { $eq: ["$status", "posted"] }] } } }, { $group: { _id: null, balance: { $sum: { $subtract: ["$creditPaisa", "$debitPaisa"] } }, procurementAmount: { $sum: "$creditPaisa" }, paidAmount: { $sum: "$debitPaisa" } } }], as: "ledger" } },
      { $lookup: { from: "milk_purchases", let: { id: "$_id" }, pipeline: [{ $match: { ...rangeMatch(from, to), $expr: { $eq: ["$vendorId", "$$id"] } } }, { $group: { _id: null, entries: { $sum: 1 }, quantityMilli: { $sum: "$quantityMilli" }, amountPaisa: { $sum: "$amountPaisa" } } }], as: "periodProcurement" } },
      { $lookup: { from: "payments", let: { id: "$_id" }, pipeline: [{ $match: { ...rangeMatch(from, to), partyType: "vendor", $expr: { $eq: ["$partyId", "$$id"] } } }, { $group: { _id: null, payments: { $sum: 1 }, amountPaisa: { $sum: "$amountPaisa" } } }], as: "periodPayments" } },
      { $lookup: { from: "vendor_rate_history", let: { id: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$vendorId", "$$id"] }, { $eq: ["$productSku", "MILK-001"] }, { $eq: ["$effectiveTo", null] }] } } }, { $sort: { effectiveFrom: -1 } }, { $limit: 1 }], as: "rate" } },
      { $project: { code: 1, name: 1, phone: 1, whatsapp: 1, address: 1, notes: 1, active: 1, payable: { $ifNull: [{ $first: "$ledger.balance" }, 0] }, allProcurement: { $ifNull: [{ $first: "$ledger.procurementAmount" }, 0] }, allPaid: { $ifNull: [{ $first: "$ledger.paidAmount" }, 0] }, periodEntries: { $ifNull: [{ $first: "$periodProcurement.entries" }, 0] }, periodQuantityMilli: { $ifNull: [{ $first: "$periodProcurement.quantityMilli" }, 0] }, periodProcurementPaisa: { $ifNull: [{ $first: "$periodProcurement.amountPaisa" }, 0] }, periodPayments: { $ifNull: [{ $first: "$periodPayments.payments" }, 0] }, periodPaidPaisa: { $ifNull: [{ $first: "$periodPayments.amountPaisa" }, 0] }, ratePaisa: { $first: "$rate.ratePaisa" } } },
    ]).toArray(),
    database.collection("milk_purchases").aggregate([{ $match: rangeMatch(from, to) }, { $group: { _id: null, vendorIds: { $addToSet: "$vendorId" }, entries: { $sum: 1 }, quantityMilli: { $sum: "$quantityMilli" }, amountPaisa: { $sum: "$amountPaisa" } } }]).next(),
    database.collection("payments").aggregate([{ $match: { ...rangeMatch(from, to), partyType: "vendor" } }, { $group: { _id: null, vendorIds: { $addToSet: "$partyId" }, payments: { $sum: 1 }, amountPaisa: { $sum: "$amountPaisa" } } }]).next(),
    database.collection("party_ledger_entries").aggregate([{ $match: { partyType: "vendor", status: "posted" } }, { $group: { _id: null, balance: { $sum: { $subtract: ["$creditPaisa", "$debitPaisa"] } } } }]).next(),
    database.collection("payments").aggregate([
      { $match: { ...rangeMatch(from, to), partyType: "vendor" } },
      { $lookup: { from: "vendors", localField: "partyId", foreignField: "_id", as: "vendor" } },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      ...(searchPattern ? [{ $match: { $or: [{ "vendor.name": searchPattern }, { "vendor.code": searchPattern }, { transactionNo: searchPattern }] } }] : []),
      { $sort: { businessDate: -1, createdAt: -1 } },
      { $limit: 100 },
      { $project: { transactionNo: 1, businessDate: 1, method: 1, amountPaisa: 1, notes: 1, status: 1, vendorName: { $ifNull: ["$vendor.name", "Unknown vendor"] }, vendorCode: "$vendor.code" } },
    ]).toArray(),
  ]);

  const totalProcurement = integerToBigInt(procurementTotals?.amountPaisa);
  const totalPaid = integerToBigInt(paymentTotals?.amountPaisa);
  const outstanding = integerToBigInt(outstandingTotal?.balance);

  return (
    <div className="content">
      <PageHeader title="Vendors" description="Milk suppliers, payables, payment history and running balances." actions={<DateFilter/>}/>
      <VendorForm />

      <SectionHeader title="Vendor Payables Dashboard" description={`Filtered activity from ${from} to ${to}; outstanding balance is current.`}/>
      <div className="executive-grid">
        <MetricCard label="Total procurement amount" value={formatPKR(totalProcurement)} note={`${procurementTotals?.entries ?? 0} procurement entries`} tone="warning"/>
        <MetricCard label="Total amount paid" value={formatPKR(totalPaid)} note={`${paymentTotals?.payments ?? 0} vendor payments`} tone="success"/>
        <MetricCard label="Current outstanding balance" value={formatPKR(outstanding)} note="All posted vendor ledger entries" tone={outstanding > 0n ? "danger" : "success"}/>
        <MetricCard label="Vendors supplied" value={String(Array.isArray(procurementTotals?.vendorIds) ? procurementTotals.vendorIds.length : 0)} note={`${formatMilli(integerToBigInt(procurementTotals?.quantityMilli))} L procured`} tone="info"/>
        <MetricCard label="Vendors paid" value={String(Array.isArray(paymentTotals?.vendorIds) ? paymentTotals.vendorIds.length : 0)} note="Unique vendors paid in range" tone="brand"/>
      </div>

      <SectionHeader title="Vendor list" description="Current payable plus procurement and payments in the selected period."/>
      <form>
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        <FilterToolbar>
          <SearchField defaultValue={q} placeholder="Search name, code or phone" />
          <button className="button secondary">Search</button>
          {q ? <ClearSearch/> : null}
          {q ? <span className="result-count">{vendors.length} results</span> : null}
        </FilterToolbar>
      </form>
      <DataTableContainer>
        {vendors.length === 0 ? <EmptyState title="No vendors found" description={q ? "Try another vendor search." : "Add the first supplier above to begin procurement."}/> : (
          <table className="table">
            <thead><tr><th>Vendor</th><th>Period Milk</th><th>Period Procurement</th><th>Period Paid</th><th>Current Outstanding</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{vendors.map((vendor) => {
              const payable = integerToBigInt(vendor.payable);
              const periodProcurementPaisa = integerToBigInt(vendor.periodProcurementPaisa);
              const periodPaidPaisa = integerToBigInt(vendor.periodPaidPaisa);
              const previousOutstanding = payable - periodProcurementPaisa + periodPaidPaisa;
              const number = normalizePakistanPhone(String(vendor.whatsapp ?? vendor.phone ?? ""));
              const message = encodeURIComponent(formatVendorAccountSummaryMessage({
                vendorName: String(vendor.name),
                date: to,
                todayMilkQuantityMilli: integerToBigInt(vendor.periodQuantityMilli),
                todayProcurementAmountPaisa: periodProcurementPaisa,
                previousOutstandingPaisa: previousOutstanding,
                totalProcurementValuePaisa: integerToBigInt(vendor.allProcurement),
                totalPaymentsReceivedPaisa: integerToBigInt(vendor.allPaid),
                currentRemainingPayablePaisa: payable,
              }));
              const vendorRow = { id: vendor._id.toString(), code: String(vendor.code), name: String(vendor.name), phone: String(vendor.phone ?? ""), whatsapp: String(vendor.whatsapp ?? ""), address: String(vendor.address ?? ""), notes: String(vendor.notes ?? ""), active: Boolean(vendor.active), milkRate: paisaInput(vendor.ratePaisa), payablePaisa: payable.toString() };
              return <tr key={vendorRow.id}><td><b>{vendor.name}</b><div className="subtitle">{vendor.code} · {vendor.phone || "No phone"}</div></td><td>{formatMilli(integerToBigInt(vendor.periodQuantityMilli))} L<div className="subtitle">{Number(vendor.periodEntries)} entries</div></td><td>{formatPKR(periodProcurementPaisa)}</td><td>{formatPKR(periodPaidPaisa)}<div className="subtitle">{Number(vendor.periodPayments)} payments</div></td><td><b>{formatPKR(payable)}</b><div className="subtitle">{payable <= 0n ? "Fully paid" : "Payable"}</div></td><td><span className="badge">{vendor.active ? "Active" : "Inactive"}</span></td><td><div className="toolbar row-actions"><VendorPaymentForm vendor={vendorRow} today={today}/><VendorActions vendor={vendorRow}/>{number ? <a className="button secondary" href={`https://wa.me/${number}?text=${message}`} target="_blank" rel="noreferrer">WhatsApp</a> : <button className="button secondary" disabled>Add WhatsApp number</button>}</div></td></tr>;
            })}</tbody>
          </table>
        )}
      </DataTableContainer>

      <SectionHeader title="Vendor payment history" description="Posted payments in the selected date range."/>
      <DataTableContainer>
        {paymentHistory.length ? (
          <table className="table">
            <thead><tr><th>Payment</th><th>Date</th><th>Vendor</th><th>Method</th><th>Amount</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>{paymentHistory.map((payment) => <tr key={payment._id.toString()}><td><b>{String(payment.transactionNo)}</b></td><td>{String(payment.businessDate)}</td><td><b>{String(payment.vendorName)}</b><div className="subtitle">{String(payment.vendorCode ?? "No code")}</div></td><td>{String(payment.method)}</td><td>{formatPKR(integerToBigInt(payment.amountPaisa))}</td><td><span className="badge">{String(payment.status)}</span></td><td>{String(payment.notes ?? "—")}</td></tr>)}</tbody>
          </table>
        ) : <EmptyState title="No vendor payments" description={q ? "No payments match this search and date range." : "Record a vendor payment to see history here."}/>}
      </DataTableContainer>
    </div>
  );
}
