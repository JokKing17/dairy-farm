import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { businessDateFilter } from "@/lib/date-utils";
import { DateFilter } from "@/components/date-filter";
import { formatPKR, integerToBigInt } from "@/lib/money";
import { karachiBusinessDate } from "@/lib/queries";
import { ExpenseForm } from "./expense-form";
import { ReverseExpenseForm } from "./reverse-expense-form";
import { FilterToolbar, SearchField } from "@/components/ui";

export const dynamic = "force-dynamic";

const categoryLabel = (c: string) =>
  c.replaceAll("-", " ").replace(/\b\w/g, (l) => l.toUpperCase());

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string }>;
}) {
  await requireSession();
  const { from, to, q } = await searchParams;
  const today = karachiBusinessDate();
  const database = await db();
  const dateFilter = businessDateFilter(from, to);
  const match: Record<string, unknown> = {};
  if (dateFilter) Object.assign(match, dateFilter);
  if (q) {
    const regex = { $regex: q, $options: "i" };
    match.$or = [{ transactionNo: regex }, { category: regex }, { description: regex }];
  }

  const [rows, totals] = await Promise.all([
    database
      .collection("expenses")
      .find(match)
      .sort({ businessDate: -1, createdAt: -1 })
      .limit(100)
      .toArray(),
    database
      .collection("expenses")
      .aggregate([
        { $match: { ...match, status: "posted" } },
        { $group: { _id: null, amount: { $sum: "$amountPaisa" }, count: { $sum: 1 } } },
      ])
      .next(),
  ]);

  const totalAmount = integerToBigInt(totals?.amount);
  const count = Number(totals?.count ?? 0);

  return (
    <div className="content">
      <div className="customer-heading">
        <div>
          <div className="title">Expenses</div>
          <div className="subtitle">Posted operating expenses and payment source.</div>
        </div>
        <div className="toolbar">
          <DateFilter />
        </div>
      </div>

      <section className="grid kpis operational-analytics-removed">
        <article className="card">
          <div className="kpi-label">Total expenses</div>
          <div className="kpi-value">{formatPKR(totalAmount)}</div>
        </article>
        <article className="card">
          <div className="kpi-label">Expense count</div>
          <div className="kpi-value">{count}</div>
        </article>
        <article className="card">
          <div className="kpi-label">Period</div>
          <div className="kpi-value kpi-period">{from && to ? `${from} – ${to}` : from ?? to ?? "All time"}</div>
        </article>
      </section>

      <details className="card add-form">
        <summary className="button secondary open-form">Add expense</summary>
        <div className="add-form-body">
          <ExpenseForm today={today} />
        </div>
      </details>
      <form>
        <input type="hidden" name="from" value={from ?? ""} />
        <input type="hidden" name="to" value={to ?? ""} />
        <FilterToolbar>
          <SearchField defaultValue={q} placeholder="Search number, category or description" />
          <button className="button secondary">Search</button>
          {q ? <span className="result-count">{rows.length} results</span> : null}
        </FilterToolbar>
      </form>

      <div className="card table-card table-scroll">
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th>Category</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id.toString()}>
                  <td><b>{String(row.transactionNo)}</b></td>
                  <td>{String(row.businessDate)}</td>
                  <td>{categoryLabel(String(row.category))}</td>
                  <td>{String(row.paymentMethod).charAt(0).toUpperCase() + String(row.paymentMethod).slice(1)}</td>
                  <td>{formatPKR(integerToBigInt(row.amountPaisa))}</td>
                  <td>{row.description ? String(row.description) : "—"}</td>
                  <td><span className="badge">{String(row.status)}</span></td>
                  <td>{String(row.status) === "posted" ? <ReverseExpenseForm transactionNo={String(row.transactionNo)} /> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <b>No expenses recorded</b>
            <span>Posted operating expenses will appear here.</span>
          </div>
        )}
      </div>
    </div>
  );
}
