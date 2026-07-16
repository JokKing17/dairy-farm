import { Long } from "mongodb";
import { db } from "@/lib/db";
import { formatPKR } from "@/lib/money";
import { ProcurementForm } from "./procurement-form";

export const dynamic = "force-dynamic";

function karachiDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

export default async function QuickEntryPage() {
  const database = await db();
  const vendors = await database.collection("vendors").aggregate([
    { $match: { active: true } }, { $sort: { name: 1 } },
    { $lookup: { from: "vendor_rate_history", let: { vendor: "$_id" }, pipeline: [{ $match: { $expr: { $eq: ["$vendorId", "$$vendor"] }, effectiveFrom: { $lte: new Date() }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: new Date() } }] } }, { $sort: { effectiveFrom: -1 } }, { $limit: 1 }], as: "rate" } },
    { $project: { code: 1, name: 1, rate: { $first: "$rate.ratePaisa" } } },
  ]).toArray();
  const rows = vendors.map((vendor) => ({ id: vendor._id.toString(), code: String(vendor.code), name: String(vendor.name), rate: formatPKR((vendor.rate as Long | undefined)?.toBigInt() ?? 0n).replace("PKR ", "").replaceAll(",", "") }));
  return <div className="content"><div className="title">Vendor milk entry</div><div className="subtitle">Rates are loaded from effective-dated vendor history and snapshotted when posted.</div>{rows.length ? <ProcurementForm vendors={rows} today={karachiDate()} /> : <div className="card empty-state table-card"><b>No active vendors</b><span>Add a vendor and milk rate before posting procurement.</span></div>}</div>;
}
