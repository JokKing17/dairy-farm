import { db } from "@/lib/db";
import { addDays } from "@/lib/date-utils";
import { DateFilter } from "@/components/date-filter";
import { formatPKR, integerToBigInt } from "@/lib/money";
import { VendorForm } from "./vendor-form";
import { FilterToolbar, SearchField } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; q?: string }> }) {
  const { from, to, q } = await searchParams;
  const database = await db();
  const pipeline: Record<string, unknown>[] = [
    ...(q ? [{ $match: { $or: ["name", "code", "phone"].map((field) => ({ [field]: { $regex: q, $options: "i" } })) } }] : []),
    { $sort: { name: 1 } },
    { $limit: 100 },
    { $lookup: { from: "party_ledger_entries", localField: "_id", foreignField: "partyId", as: "ledger" } },
  ];
  if (from || to) {
    const gte = from ?? "2000-01-01";
    const lt = to ? addDays(to, 1) : "2100-01-01";
    pipeline.push({ $addFields: { filteredLedger: { $filter: { input: "$ledger", as: "line", cond: { $and: [{ $gte: ["$$line.businessDate", gte] }, { $lt: ["$$line.businessDate", lt] }] } } } } });
    pipeline.push({ $addFields: { payable: { $sum: { $map: { input: "$filteredLedger", as: "line", in: { $subtract: ["$$line.creditPaisa", "$$line.debitPaisa"] } } } } } });
  } else {
    pipeline.push({ $addFields: { payable: { $sum: { $map: { input: "$ledger", as: "line", in: { $subtract: ["$$line.creditPaisa", "$$line.debitPaisa"] } } } } } });
  }
  pipeline.push({ $project: { code: 1, name: 1, phone: 1, active: 1, payable: 1 } });
  const vendors = await database.collection("vendors").aggregate(pipeline).toArray();

  return (
    <div className="content">
      <div className="customer-heading">
        <div>
          <div className="title">Vendors</div>
          <div className="subtitle">Milk suppliers, immutable rate history and running payables.</div>
        </div>
        <div className="toolbar">
          <DateFilter/>
        </div>
      </div>
      <VendorForm />
      <form>
        <input type="hidden" name="from" value={from ?? ""} />
        <input type="hidden" name="to" value={to ?? ""} />
        <FilterToolbar>
          <SearchField defaultValue={q} placeholder="Search name, code or phone" />
          <button className="button secondary">Search</button>
          {q ? <span className="result-count">{vendors.length} results</span> : null}
        </FilterToolbar>
      </form>
      <div className="card table-card">
        {vendors.length === 0 ? <div className="empty-state"><b>No vendors yet</b><span>Add the first supplier above to begin procurement.</span></div> : (
          <table className="table">
            <thead><tr><th>Code</th><th>Vendor</th><th>Phone</th><th>Current payable</th><th>Status</th></tr></thead>
            <tbody>{vendors.map((vendor) => <tr key={vendor._id.toString()}><td><b>{vendor.code}</b></td><td>{vendor.name}</td><td>{vendor.phone || "—"}</td><td>{formatPKR(integerToBigInt(vendor.payable))}</td><td><span className="badge">{vendor.active ? "Active" : "Inactive"}</span></td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
