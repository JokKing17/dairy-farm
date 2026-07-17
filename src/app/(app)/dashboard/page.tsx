import { AlertTriangle, ArrowRight } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { formatMilli, formatPKR, integerToBigInt } from "@/lib/money";
import { dashboard } from "@/lib/queries";

export const dynamic = "force-dynamic";

function bigint(value: unknown) {
  return integerToBigInt(value);
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", hour12: false }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function DashboardPage() {
  const session = await requireSession();
  let data: Awaited<ReturnType<typeof dashboard>> | null = null;
  let error = false;
  try { data = await dashboard(); } catch { error = true; }
  const cards = data ? [
    ["Milk purchased", `${formatMilli(bigint(data.purchases?.quantity))} L`, "Posted procurement"],
    ["Purchase cost", formatPKR(bigint(data.purchases?.amount)), "Today’s vendor intake"],
    ["Revenue", formatPKR(bigint(data.sales?.amount)), "Posted sales and deliveries"],
    ["Expenses", formatPKR(bigint(data.expenses?.amount)), "Posted today"],
    ["Receivables", formatPKR(bigint(data.receivables?.balance)), "Money to receive"],
    ["Vendor payables", formatPKR(bigint(data.payables?.balance)), "Money to pay"],
    ["Milk movements", String(data.milkFlow.length), "Movement categories today"],
    ["Open alerts", String(data.alerts.length), "Needs attention"],
  ] : [];
  return <div className="content"><div className="dashboard-heading"><div><div className="title">{greeting()}, {session.name}</div><div className="subtitle">Business date {data?.businessDate ?? "unavailable"}{data ? ` · refreshed ${data.refreshedAt.toLocaleTimeString("en-PK", { timeZone: "Asia/Karachi" })}` : ""}</div></div><a className="button" href="/quick-entry">Record procurement <ArrowRight size={14}/></a></div>{error ? <div className="degraded-banner" role="alert"><AlertTriangle size={18}/><div><b>Dashboard data is unavailable</b><span>MongoDB could not complete one or more analytics queries. No values have been replaced with zero.</span></div></div> : <><section className="grid kpis">{cards.map(([label,value,note])=><article className="card" key={label}><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-note">{note}</div></article>)}</section><section className="grid split"><article className="card"><div className="section-title">Today’s milk movements</div>{data?.milkFlow.length ? <table className="table"><thead><tr><th>Movement</th><th>Quantity</th></tr></thead><tbody>{data.milkFlow.map((row)=><tr key={String(row._id)}><td>{String(row._id).replaceAll("-"," ")}</td><td><b>{formatMilli(bigint(row.quantity))} L</b></td></tr>)}</tbody></table> : <div className="empty-state"><b>No milk movements today</b><span>Posted procurement, sales, deliveries and production will appear here.</span></div>}</article><article className="card"><div className="section-title">Attention needed</div>{data?.alerts.length ? data.alerts.map((alert)=><div className="alert" key={alert._id.toString()}><span className="dot"/><div><b>{String(alert.title ?? "Operational alert")}</b><div className="subtitle">{String(alert.message ?? "Review this item")}</div></div></div>) : <div className="empty-state"><b>No open alerts</b><span>Operational exceptions will appear here.</span></div>}</article></section></>}</div>;
}
