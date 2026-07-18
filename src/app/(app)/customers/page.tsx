import Link from "next/link";
import { db } from "@/lib/db";
import { addDays } from "@/lib/date-utils";
import { normalizePakistanPhone } from "@/lib/customer-statement";
import { DateFilter } from "@/components/date-filter";
import { formatMilli, formatPKR, integerToBigInt } from "@/lib/money";
import { karachiBusinessDate } from "@/lib/queries";
import { EmptyState, FilterToolbar, PageHeader, SearchField } from "@/components/ui";
import { escapedSearchPattern, normalizeSearchQuery } from "@/lib/search";
import { CustomerForm, PaymentForm } from "./customer-forms";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ type?: string; from?: string; to?: string; q?: string }> }) {
  const database = await db();
  const query = await searchParams;
  const type = query.type === "shop" ? "shop" : "household";
  const { from, to } = query;
  const q = normalizeSearchQuery(query.q);
  const businessDate = karachiBusinessDate();
  const month = businessDate.slice(0, 7);
  const start = from ?? `${month}-01`;
  const end = to ? addDays(to, 1) : new Date(Date.UTC(Number(month.split("-")[0]), Number(month.split("-")[1]), 1)).toISOString().slice(0, 10);
  const customerMatch: Record<string, unknown> = { customerType: type };
  if (q) {
    const pattern = escapedSearchPattern(q)!;
    customerMatch.$or = [{ name: pattern }, { code: pattern }, { address: pattern }, { phone: pattern }, { whatsapp: pattern }];
  }
  const rows = await database.collection("customers").aggregate([
    { $match: customerMatch },
    { $sort: type === "household" ? { deliverySequence: 1, name: 1 } : { name: 1 } },
    { $lookup: { from: "party_ledger_entries", let: { id: "$_id" }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ["$partyId", "$$id"] }, { $eq: ["$partyType", "customer"] }, { $eq: ["$status", "posted"] }] } } },
      { $group: { _id: null, debit: { $sum: "$debitPaisa" }, credit: { $sum: "$creditPaisa" }, monthDebit: { $sum: { $cond: [{ $and: [{ $gte: ["$businessDate", start] }, { $lt: ["$businessDate", end] }] }, "$debitPaisa", 0] } }, monthCredit: { $sum: { $cond: [{ $and: [{ $gte: ["$businessDate", start] }, { $lt: ["$businessDate", end] }] }, "$creditPaisa", 0] } }, lastPayment: { $max: { $cond: [{ $gt: ["$creditPaisa", 0] }, "$businessDate", null] } }, lastCredit: { $max: { $cond: [{ $gt: ["$debitPaisa", 0] }, "$businessDate", null] } } } },
    ], as: "ledger" } },
    { $lookup: { from: "customer_deliveries", let: { id: "$_id" }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ["$customerId", "$$id"] }, { $eq: ["$status", "posted"] }, { $gte: ["$businessDate", start] }, { $lt: ["$businessDate", end] }] } } },
      { $group: { _id: null, milk: { $sum: "$milkQuantityMilli" }, charges: { $sum: "$amountPaisa" } } },
    ], as: "deliveries" } },
  ]).toArray();
  const tabHref = (nextType: string) => {
    const params = new URLSearchParams({ type: nextType });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (q) params.set("q", q);
    return `/customers?${params}`;
  };

  return <div className="content">
    <PageHeader title="Customers" description="Household deliveries and Shop Customer Udhaar accounts." actions={<><DateFilter/>{type === "household" ? <Link className="button" href="/deliveries">Open Daily Deliveries</Link> : <Link className="button" href="/sales">New Shop Sale</Link>}</>}/>
    <CustomerForm/>
    <nav className="toolbar customer-tabs" aria-label="Customer type"><Link className={`button ${type === "household" ? "" : "secondary"}`} href={tabHref("household")}>Household Deliveries</Link><Link className={`button ${type === "shop" ? "" : "secondary"}`} href={tabHref("shop")}>Shop Customers</Link></nav>
    <form>
      <input type="hidden" name="type" value={type}/><input type="hidden" name="from" value={from ?? ""}/><input type="hidden" name="to" value={to ?? ""}/>
      <FilterToolbar><SearchField defaultValue={q} placeholder={type === "shop" ? "Search account name, code, phone or address" : "Search name, code, address or phone"}/><button className="button secondary">Search</button>{q ? <Link className="button ghost" href={tabHref(type).replace(/&q=[^&]*/, "")}>Clear search</Link> : null}<span className="result-count">{rows.length} {rows.length === 1 ? "customer" : "customers"}</span></FilterToolbar>
    </form>
    <div className="card table-card table-scroll">{rows.length ? <table className="table"><thead><tr>{type === "household" ? <><th>Customer</th><th>Address</th><th>Daily Milk</th><th>This month</th><th>Payments</th></> : <><th>Shop Customer</th><th>Total Credit</th><th>Total payments</th><th>Last Credit / payment</th></>}<th>Outstanding</th><th>Actions</th></tr></thead><tbody>{rows.map(row => {
      const ledger = row.ledger?.[0], delivery = row.deliveries?.[0];
      const balance = integerToBigInt(ledger?.debit) - integerToBigInt(ledger?.credit);
      const number = normalizePakistanPhone(String(row.whatsapp || row.phone || ""));
      const message = encodeURIComponent(type === "shop" ? `Assalam-o-Alaikum ${row.name}. Your remaining shop Udhaar balance is ${formatPKR(balance)}. Please send payment when convenient. Thank you.` : `Assalam-o-Alaikum ${row.name}. Your remaining DairyFlow balance is ${formatPKR(balance)}.`);
      return <tr key={row._id.toString()}>{type === "household" ? <><td><b>{row.name}</b><div className="subtitle">{row.code}</div></td><td>{row.address}</td><td>{formatMilli(integerToBigInt(row.defaultQuantityMilli))} L</td><td>{formatMilli(integerToBigInt(delivery?.milk))} L · {formatPKR(integerToBigInt(delivery?.charges))}</td><td>{formatPKR(integerToBigInt(ledger?.monthCredit))}</td></> : <><td><b>{row.name}</b><div className="subtitle">{row.phone || "No phone"}</div></td><td>{formatPKR(integerToBigInt(ledger?.debit))}</td><td>{formatPKR(integerToBigInt(ledger?.credit))}</td><td>{ledger?.lastCredit || "—"} / {ledger?.lastPayment || "—"}</td></>}<td><b>{formatPKR(balance)}</b></td><td><div className="toolbar row-actions"><PaymentForm id={row._id.toString()} businessDate={businessDate}/><Link className="button secondary" href={`/customers/${row._id}?month=${month}`}>Statement</Link>{number ? <a className="button secondary" href={`https://wa.me/${number}?text=${message}`} target="_blank" rel="noreferrer">WhatsApp</a> : <button className="button secondary" disabled>Add WhatsApp number</button>}</div></td></tr>;
    })}</tbody></table> : <EmptyState title={q ? "No matching customers" : `No ${type === "shop" ? "Shop Customers" : "Household Delivery Customers"} yet`} description={q ? "Try a different name, code, address or phone number." : "Add the first customer above."}/>}</div>
  </div>;
}
