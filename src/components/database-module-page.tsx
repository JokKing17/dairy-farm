import { Long } from "mongodb";
import { db } from "@/lib/db";
import { formatPKR } from "@/lib/money";

const display = (value: unknown, key: string) => {
  if (value instanceof Long) return key.toLowerCase().includes("paisa") ? formatPKR(value.toBigInt()) : value.toString();
  if (value instanceof Date) return value.toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" });
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
};
export async function DatabaseModulePage({ title, description, collection, columns }: { title: string; description: string; collection: string; columns: [string, string][] }) {
  const rows = await (await db()).collection(collection).find({}).sort({ createdAt: -1 }).limit(100).toArray();
  return <div className="content"><div className="title">{title}</div><div className="subtitle">{description}</div><div className="card table-card table-scroll">{rows.length ? <table className="table"><thead><tr>{columns.map(([label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row._id.toString()}>{columns.map(([label, key]) => <td key={label}>{display(row[key], key)}</td>)}</tr>)}</tbody></table> : <div className="empty-state"><b>No records yet</b><span>Posted {title.toLowerCase()} records will appear here.</span></div>}</div></div>;
}
