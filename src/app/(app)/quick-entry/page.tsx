import { DateFilter } from "@/components/date-filter";
import { ClearSearch } from "@/components/clear-search";
import { DataTableContainer, EmptyState, FilterToolbar, MetricCard, PageHeader, SearchField, SectionHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { addDays } from "@/lib/date-utils";
import { formatMilli, formatPKR, integerToBigInt } from "@/lib/money";
import { escapedSearchPattern, normalizeSearchQuery } from "@/lib/search";
import { ProcurementForm } from "./procurement-form";

export const dynamic = "force-dynamic";

function karachiDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function dateMatch(from: string, to: string) {
  return { businessDate: { $gte: from, $lt: addDays(to, 1) }, status: "posted" };
}

const shiftLabel = (value: unknown) => {
  const text = String(value ?? "");
  return text ? text[0].toUpperCase() + text.slice(1) : "—";
};

export default async function QuickEntryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; q?: string }> }) {
  const database = await db();
  const today = karachiDate();
  const { from: rawFrom, to: rawTo, q: rawQuery } = await searchParams;
  const from = rawFrom ?? today;
  const to = rawTo ?? today;
  const q = normalizeSearchQuery(rawQuery);
  const searchPattern = escapedSearchPattern(q);

  const vendors = await database.collection("vendors").aggregate([
    { $match: { active: true } },
    { $sort: { name: 1 } },
    { $lookup: { from: "vendor_rate_history", let: { vendor: "$_id" }, pipeline: [{ $match: { $expr: { $eq: ["$vendorId", "$$vendor"] }, effectiveFrom: { $lte: new Date() }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: new Date() } }] } }, { $sort: { effectiveFrom: -1 } }, { $limit: 1 }], as: "rate" } },
    { $project: { code: 1, name: 1, rate: { $first: "$rate.ratePaisa" } } },
  ]).toArray();
  const rows = vendors.map((vendor) => ({ id: vendor._id.toString(), code: String(vendor.code), name: String(vendor.name), rate: formatPKR(integerToBigInt(vendor.rate)).replace("PKR ", "").replaceAll(",", "") }));

  const baseMatch = dateMatch(from, to);
  const vendorLookup = { $lookup: { from: "vendors", localField: "vendorId", foreignField: "_id", as: "vendor" } };
  const unwindVendor = { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } };
  const vendorSearch = searchPattern ? { $match: { $or: [{ "vendor.name": searchPattern }, { "vendor.code": searchPattern }, { transactionNo: searchPattern }] } } : null;
  const [dailySummary, vendorSummary, purchases, batches] = await Promise.all([
    database.collection("milk_purchases").aggregate([
      { $match: baseMatch },
      { $group: { _id: null, vendorIds: { $addToSet: "$vendorId" }, quantityMilli: { $sum: "$quantityMilli" }, amountPaisa: { $sum: "$amountPaisa" }, entryCount: { $sum: 1 } } },
    ]).next(),
    database.collection("milk_purchases").aggregate([
      { $match: baseMatch },
      vendorLookup,
      unwindVendor,
      ...(vendorSearch ? [vendorSearch] : []),
      { $group: { _id: "$vendorId", vendorName: { $first: { $ifNull: ["$vendor.name", "Unknown vendor"] } }, vendorCode: { $first: "$vendor.code" }, entries: { $sum: 1 }, quantityMilli: { $sum: "$quantityMilli" }, amountPaisa: { $sum: "$amountPaisa" } } },
      { $sort: { vendorName: 1 } },
    ]).toArray(),
    database.collection("milk_purchases").aggregate([
      { $match: baseMatch },
      vendorLookup,
      unwindVendor,
      ...(vendorSearch ? [vendorSearch] : []),
      { $sort: { businessDate: -1, createdAt: -1, lineNo: 1 } },
      { $limit: 200 },
      { $project: { transactionNo: 1, lineNo: 1, businessDate: 1, shift: 1, quantityMilli: 1, ratePaisa: 1, amountPaisa: 1, notes: 1, status: 1, vendorName: { $ifNull: ["$vendor.name", "Unknown vendor"] }, vendorCode: "$vendor.code" } },
    ]).toArray(),
    database.collection("procurement_batches").find(baseMatch).sort({ businessDate: -1, createdAt: -1 }).limit(100).toArray(),
  ]);

  const totalVendors = Array.isArray(dailySummary?.vendorIds) ? dailySummary.vendorIds.length : 0;
  const totalQuantity = integerToBigInt(dailySummary?.quantityMilli);
  const totalAmount = integerToBigInt(dailySummary?.amountPaisa);

  return (
    <div className="content">
      <PageHeader title="Quick Milk Entry" description="Record vendor Milk intake, then review complete procurement history by date and vendor."/>
      {rows.length ? <ProcurementForm vendors={rows} today={today} /> : <div className="card empty-state table-card"><b>No active vendors</b><span>Add a vendor and Milk rate before posting procurement.</span></div>}

      <SectionHeader title="Milk Procurement History" description={`Showing posted procurement from ${from} to ${to}.`} actions={<DateFilter/>}/>
      <form>
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        <FilterToolbar>
          <SearchField defaultValue={q} placeholder="Search vendor, code or receipt" />
          <button className="button secondary">Search</button>
          {q ? <ClearSearch/> : null}
          {q ? <span className="result-count">{purchases.length} matching entries</span> : null}
        </FilterToolbar>
      </form>

      <div className="executive-grid">
        <MetricCard label="Vendors supplied" value={String(totalVendors)} note="Unique posted vendors in range" tone="info"/>
        <MetricCard label="Total milk procured" value={`${formatMilli(totalQuantity)} L`} note={`${dailySummary?.entryCount ?? 0} posted entries`} tone="success"/>
        <MetricCard label="Total procurement cost" value={formatPKR(totalAmount)} note="Added to vendor payables" tone="warning"/>
      </div>

      <SectionHeader title="Vendor-wise totals" description="Multiple morning/evening entries are aggregated per vendor."/>
      <DataTableContainer>
        {vendorSummary.length ? (
          <table className="table">
            <thead><tr><th>Vendor</th><th>Entries</th><th>Total Milk</th><th>Total Cost</th><th>Average Rate</th></tr></thead>
            <tbody>{vendorSummary.map((row) => {
              const quantity = integerToBigInt(row.quantityMilli), amount = integerToBigInt(row.amountPaisa);
              return <tr key={String(row._id)}><td><b>{String(row.vendorName)}</b><div className="subtitle">{String(row.vendorCode ?? "No code")}</div></td><td>{Number(row.entries)}</td><td>{formatMilli(quantity)} L</td><td>{formatPKR(amount)}</td><td>{quantity > 0n ? formatPKR((amount * 1000n) / quantity) : "—"}</td></tr>;
            })}</tbody>
          </table>
        ) : <EmptyState title="No vendor totals" description={q ? "No vendor matches this search and date range." : "Post milk procurement to see vendor totals."}/>}
      </DataTableContainer>

      <SectionHeader title="Procurement entries" description="Line-level milk purchases with vendor, shift, rate and payable status."/>
      <DataTableContainer>
        {purchases.length ? (
          <table className="table">
            <thead><tr><th>Receipt</th><th>Date</th><th>Shift</th><th>Vendor</th><th>Quantity</th><th>Rate / L</th><th>Total Cost</th><th>Payment Status</th><th>Notes</th></tr></thead>
            <tbody>{purchases.map((purchase) => <tr key={`${String(purchase.transactionNo)}-${String(purchase.lineNo)}`}><td><b>{String(purchase.transactionNo)}</b></td><td>{String(purchase.businessDate)}</td><td>{shiftLabel(purchase.shift)}</td><td><b>{String(purchase.vendorName)}</b><div className="subtitle">{String(purchase.vendorCode ?? "No code")}</div></td><td>{formatMilli(integerToBigInt(purchase.quantityMilli))} L</td><td>{formatPKR(integerToBigInt(purchase.ratePaisa))}</td><td>{formatPKR(integerToBigInt(purchase.amountPaisa))}</td><td><span className="badge">Payable posted</span></td><td>{String(purchase.notes ?? "—")}</td></tr>)}</tbody>
          </table>
        ) : <EmptyState title="No procurement entries" description={q ? "No procurement lines match this search." : "Posted milk procurement entries will appear here."}/>}
      </DataTableContainer>

      <SectionHeader title="Batch totals" description="Overall procurement totals by receipt/batch."/>
      <DataTableContainer>
        {batches.length ? (
          <table className="table">
            <thead><tr><th>Receipt</th><th>Date</th><th>Shift</th><th>Total Milk</th><th>Total Cost</th><th>Status</th></tr></thead>
            <tbody>{batches.map((batch) => <tr key={batch._id.toString()}><td><b>{String(batch.transactionNo)}</b></td><td>{String(batch.businessDate)}</td><td>{shiftLabel(batch.shift)}</td><td>{formatMilli(integerToBigInt(batch.totalQuantityMilli))} L</td><td>{formatPKR(integerToBigInt(batch.totalAmountPaisa))}</td><td><span className="badge">{String(batch.status)}</span></td></tr>)}</tbody>
          </table>
        ) : <EmptyState title="No procurement batches" description="Batch totals are created when Quick Milk Entry is posted."/>}
      </DataTableContainer>
    </div>
  );
}
