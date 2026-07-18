import { db } from "@/lib/db";
import { businessDateFilter } from "@/lib/date-utils";
import { DateFilter } from "@/components/date-filter";
import { formatPKR, integerToBigInt } from "@/lib/money";
import { FilterToolbar, SearchField } from "./ui";

const display = (value: unknown, key: string) => {
  if (key.toLowerCase().includes("paisa")) return formatPKR(integerToBigInt(value));
  if (value instanceof Date) return value.toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" });
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
};

export async function DatabaseModulePage({
  title, description, collection, columns, dateField = "businessDate", from, to, q,
}: {
  title: string; description: string; collection: string; columns: [string, string][];
  dateField?: string; from?: string; to?: string; q?: string;
}) {
  const filter: Record<string, unknown> = {};
  const dateFilter = businessDateFilter(from, to);
  if (dateFilter) {
    const bdFilter = dateFilter.businessDate as Record<string, unknown>;
    if (dateField === "createdAt" || dateField === "date") {
      const dateFilter2: Record<string, unknown> = {};
      if (bdFilter.$gte) dateFilter2.$gte = new Date(String(bdFilter.$gte) + "T00:00:00Z");
      if (bdFilter.$lt) dateFilter2.$lt = new Date(String(bdFilter.$lt) + "T00:00:00Z");
      filter[dateField] = dateFilter2;
    } else {
      filter[dateField] = bdFilter;
    }
  }
  if (q) {
    const regex = { $regex: q, $options: "i" };
    filter.$or = columns.map(([, key]) => ({ [key]: regex }));
  }
  const rows = await (await db()).collection(collection).find(filter).sort({ createdAt: -1 }).limit(100).toArray();

  return (
    <div className="content">
      <div className="customer-heading">
        <div>
          <div className="title">{title}</div>
          <div className="subtitle">{description}</div>
        </div>
        <div className="toolbar"><DateFilter /></div>
      </div>
      <form>
        <input type="hidden" name="from" value={from ?? ""} />
        <input type="hidden" name="to" value={to ?? ""} />
        <FilterToolbar>
          <SearchField defaultValue={q} placeholder={`Search ${title.toLowerCase()}`} />
          <button className="button secondary">Search</button>
          {q ? <span className="result-count">{rows.length} results</span> : null}
        </FilterToolbar>
      </form>
      <div className="card table-card table-scroll">
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>{columns.map(([label]) => <th key={label}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row._id.toString()}>
                  {columns.map(([label, key]) => <td key={label}>{display(row[key], key)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <b>No records yet</b>
            <span>Posted {title.toLowerCase()} records will appear here.</span>
          </div>
        )}
      </div>
    </div>
  );
}
