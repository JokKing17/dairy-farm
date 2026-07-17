import { db } from "@/lib/db";
import { formatPKR, integerToBigInt } from "@/lib/money";
import { VendorForm } from "./vendor-form";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const database = await db();
  const vendors = await database.collection("vendors").aggregate([
    { $sort: { name: 1 } },
    { $limit: 100 },
    { $lookup: { from: "party_ledger_entries", localField: "_id", foreignField: "partyId", as: "ledger" } },
    { $addFields: { payable: { $sum: { $map: { input: "$ledger", as: "line", in: { $subtract: ["$$line.creditPaisa", "$$line.debitPaisa"] } } } } } },
    { $project: { code: 1, name: 1, phone: 1, active: 1, payable: 1 } },
  ]).toArray();

  return (
    <div className="content">
      <div className="title">Vendors</div>
      <div className="subtitle">Milk suppliers, immutable rate history and running payables.</div>
      <VendorForm />
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
