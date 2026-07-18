import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { businessDateFilter } from "@/lib/date-utils";
import { DateFilter } from "@/components/date-filter";
import { formatPKR, integerToBigInt } from "@/lib/money";
import { karachiBusinessDate } from "@/lib/queries";
import { ExpenseForm } from "./expense-form";
import { ReverseExpenseForm } from "./reverse-expense-form";
import { FilterToolbar, PageHeader, SearchField, SectionHeader } from "@/components/ui";
import { escapedSearchPattern, normalizeSearchQuery } from "@/lib/search";
import { ClearSearch } from "@/components/clear-search";

export const dynamic = "force-dynamic";

const categoryLabel = (c: string) =>
  c.replaceAll("-", " ").replace(/\b\w/g, (l) => l.toUpperCase());

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string }>;
}) {
  await requireSession();
  const { from, to, q: rawQuery } = await searchParams;
  const q = normalizeSearchQuery(rawQuery);
  const today = karachiBusinessDate();
  const database = await db();
  const dateFilter = businessDateFilter(from, to);
  const match: Record<string, unknown> = {};
  if (dateFilter) Object.assign(match, dateFilter);
  const searchPattern = escapedSearchPattern(q);
  if (searchPattern) {
    match.$or = [{ transactionNo: searchPattern }, { category: searchPattern }, { description: searchPattern }];
  }

  const rows = await database
      .collection("expenses")
      .find(match)
      .sort({ businessDate: -1, createdAt: -1 })
      .limit(100)
      .toArray();

  return (
    <div className="content">
      <PageHeader title="Expenses" description="Posted operating expenses and payment source." actions={<DateFilter/>}/>

      <details className="card add-form">
        <summary className="button secondary open-form">Add expense</summary>
        <div className="add-form-body">
          <ExpenseForm today={today} />
        </div>
      </details>
      <SectionHeader title="Expense history" description="Search and review the latest 100 expense records."/>
      <form>
        <input type="hidden" name="from" value={from ?? ""} />
        <input type="hidden" name="to" value={to ?? ""} />
        <FilterToolbar>
          <SearchField defaultValue={q} placeholder="Search number, category or description" />
          <button className="button secondary">Search</button>
          {q ? <ClearSearch/> : null}
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
