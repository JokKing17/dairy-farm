import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim() ?? "";
  const database = await db();
  const pattern = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
  const [vendors, customers, transactions] = pattern
    ? await Promise.all([
        database.collection("vendors").find({ $or: [{ name: pattern }, { code: pattern }, { phone: pattern }] }).limit(10).toArray(),
        database.collection("customers").find({ $or: [{ name: pattern }, { code: pattern }, { phone: pattern }] }).limit(10).toArray(),
        database.collection("financial_transactions").find({ transactionNo: pattern }).limit(10).toArray(),
      ])
    : [[], [], []];

  const results = [
    ...vendors.map((x) => ({ label: `Vendor · ${x.name}`, href: "/vendors" })),
    ...customers.map((x) => ({ label: `Customer · ${x.name}`, href: "/customers" })),
    ...transactions.map((x) => ({ label: `Transaction · ${x.transactionNo}`, href: "/reports" })),
  ];

  return (
    <div className="content">
      <div className="title">Search</div>
      <form className="toolbar">
        <input name="q" defaultValue={q} placeholder="Name, phone, code or transaction" className="card" style={{ flex: 1, border: "1px solid var(--line)", padding: "var(--s-3) var(--s-4)", borderRadius: "var(--r-lg)", fontSize: "var(--text-md)" }} autoFocus />
        <button className="button">Search</button>
      </form>
      {q ? (
        <div className="card card-plain">
          {results.length ? (
            results.map((x) => (
              <Link key={x.label} href={x.href} className="search-result-link">{x.label}</Link>
            ))
          ) : (
            <div className="empty-state">
              <b>No matches</b>
              <span>Try a complete phone number or shorter name.</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
