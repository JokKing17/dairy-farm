import { AlertTriangle, ArrowRight, Droplets, TrendingUp, TrendingDown, DollarSign, Users, Bell } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { DateFilter } from "@/components/date-filter";
import { formatMilli, formatPKR, integerToBigInt } from "@/lib/money";
import { dashboard } from "@/lib/queries";

export const dynamic = "force-dynamic";

function bigint(value: unknown) { return integerToBigInt(value); }

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", hour12: false }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function dateLabel(from?: string, to?: string): string {
  if (!from && !to) return "today";
  if (from === to) return from!;
  return `${from} – ${to}`;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const session = await requireSession();
  const { from, to } = await searchParams;
  let data: Awaited<ReturnType<typeof dashboard>> | null = null;
  let error = false;
  try { data = await dashboard(from, to); } catch { error = true; }
  const label = dateLabel(from, to);
  const cards = data ? [
    { label: "Milk purchased", value: `${formatMilli(bigint(data.purchases?.quantity))} L`, note: "Posted procurement", icon: Droplets, color: "var(--brand)" },
    { label: "Purchase cost", value: formatPKR(bigint(data.purchases?.amount)), note: `Vendor intake ${label}`, icon: TrendingDown, color: "var(--warning)" },
    { label: "Revenue", value: formatPKR(bigint(data.sales?.amount)), note: "Posted sales and deliveries", icon: TrendingUp, color: "var(--success)" },
    { label: "Expenses", value: formatPKR(bigint(data.expenses?.amount)), note: `Posted ${label}`, icon: DollarSign, color: "var(--danger)" },
    { label: "Receivables", value: formatPKR(bigint(data.receivables?.balance)), note: "Money to receive", icon: Users, color: "var(--info)" },
    { label: "Vendor payables", value: formatPKR(bigint(data.payables?.balance)), note: "Money to pay", icon: Users, color: "var(--warning)" },
    { label: "Milk movements", value: String(data.milkFlow.length), note: `Movement categories ${label}`, icon: Droplets, color: "var(--brand)" },
    { label: "Open alerts", value: String(data.alerts.length), note: "Needs attention", icon: Bell, color: data.alerts.length > 0 ? "var(--danger)" : "var(--muted)" },
    { label: "Households delivered", value: `${bigint(data.deliveryProgress?.delivered)} / ${bigint(data.expectedMilk?.customers)}`, note: `${bigint(data.deliveryProgress?.skipped)} skipped ${label}`, icon: Users, color: "var(--success)" },
    { label: "Milk delivered", value: `${formatMilli(bigint(data.deliveryProgress?.milk))} L`, note: `Expected ${formatMilli(bigint(data.expectedMilk?.milk))} L`, icon: Droplets, color: "var(--brand)" },
  ] : [];

  return (
    <div className="content">
      <div className="dashboard-heading">
        <div>
          <div className="title">{greeting()}, {session.name}</div>
          <div className="subtitle">
            Business date {data?.businessDate ?? "unavailable"}
            {data ? ` · refreshed ${data.refreshedAt.toLocaleTimeString("en-PK", { timeZone: "Asia/Karachi" })}` : ""}
          </div>
        </div>
        <div className="toolbar">
          <DateFilter />
          <a className="button" href="/quick-entry">Record procurement <ArrowRight size={14} /></a>
        </div>
      </div>

      {error ? (
        <div className="degraded-banner" role="alert">
          <AlertTriangle size={18} />
          <div>
            <b>Dashboard data is unavailable</b>
            <span>MongoDB could not complete one or more analytics queries. No values have been replaced with zero.</span>
          </div>
        </div>
      ) : (
        <>
          <section className="grid kpis">
            {cards.map(({ label, value, note, icon: Icon, color }) => (
              <article className="card" key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="kpi-label">{label}</div>
                  <Icon size={18} color={color} style={{ opacity: 0.7 }} />
                </div>
                <div className="kpi-value">{value}</div>
                <div className="kpi-note">{note}</div>
              </article>
            ))}
          </section>

          <section className="grid split">
            <article className="card">
              <div className="section-title">Milk movements {label}</div>
              {data?.milkFlow.length ? (
                <table className="table">
                  <thead>
                    <tr><th>Movement</th><th>Quantity</th></tr>
                  </thead>
                  <tbody>
                    {data.milkFlow.map((row) => (
                      <tr key={String(row._id)}>
                        <td>{String(row._id).replaceAll("-", " ")}</td>
                        <td><b>{formatMilli(bigint(row.quantity))} L</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <b>No milk movements {label}</b>
                  <span>Posted procurement, sales, deliveries and production will appear here.</span>
                </div>
              )}
            </article>

            <article className="card">
              <div className="section-title">Attention needed</div>
              {data?.alerts.length ? data.alerts.map((alert) => (
                <div className="alert" key={alert._id.toString()}>
                  <span className="dot" />
                  <div>
                    <b>{String(alert.title ?? "Operational alert")}</b>
                    <div className="subtitle">{String(alert.message ?? "Review this item")}</div>
                  </div>
                </div>
              )) : (
                <div className="empty-state">
                  <b>No open alerts</b>
                  <span>Operational exceptions will appear here.</span>
                </div>
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}
