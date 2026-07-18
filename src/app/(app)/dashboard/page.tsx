import Link from "next/link";
import { AlertTriangle, Factory, Milk, ReceiptText, ShoppingBasket, Truck } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { DateFilter } from "@/components/date-filter";
import { formatPKR, integerToBigInt } from "@/lib/money";
import { dashboard } from "@/lib/queries";
import { ChartCard, CompositionChart, GroupedBarChart, RankingChart, TrendChart, type ChartDatum } from "@/components/analytics-charts";
import { EmptyState, MetricCard, PageHeader, SectionHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
const big = (value: unknown) => integerToBigInt(value);
const paisa = (value: unknown) => Number(big(value)) / 100;
const milli = (value: unknown) => Number(big(value)) / 1000;
const name = (value: unknown) => String(value ?? "Unknown").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
const greeting = () => {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", hour12: false }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const session = await requireSession();
  const { from, to } = await searchParams;
  let data: Awaited<ReturnType<typeof dashboard>> | null = null;
  try { data = await dashboard(from, to); } catch { /* shown as a safe degraded state */ }
  if (!data) return <div className="content"><PageHeader title="Dashboard" description="Your dairy business overview." /><div className="degraded-banner" role="alert"><AlertTriangle /><div><b>Dashboard data is unavailable</b><span>Check the database connection and try again. No values were replaced with estimates.</span></div></div></div>;

  const revenue = big(data.sales?.amount);
  const purchaseCost = big(data.purchases?.amount);
  const expenses = big(data.expenses?.amount);
  const customerCollections = big(data.customerPayments?.amount);
  const grossProfit = revenue - purchaseCost;
  const operatingResult = grossProfit - expenses;
  const daily = new Map<string, ChartDatum>();
  for (const row of data.dailySales) daily.set(String(row._id), { name: String(row._id).slice(5), revenue: paisa(row.amount), expenses: 0 });
  for (const row of data.dailyExpenses) {
    const key = String(row._id); const item = daily.get(key) ?? { name: key.slice(5), revenue: 0, expenses: 0 };
    item.expenses = paisa(row.amount); daily.set(key, item);
  }
  const dailyData = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, item]) => item);
  const procurement = data.dailyPurchases.map(row => ({ name: String(row._id).slice(5), quantity: milli(row.quantity), cost: paisa(row.amount) }));
  const customerBalances = data.customerBalances.map(row => ({ name: String(row.name), value: paisa(row.balance) }));
  const vendorBalances = data.vendorBalances.map(row => ({ name: String(row.name), value: paisa(row.balance) }));
  const stock = data.stock.filter(row => milli(row.quantity) > 0).map(row => ({ name: String(row.name), value: milli(row.quantity) }));
  const production = data.production.map(row => ({ name: String(row._id).slice(5), milk: milli(row.milk), yogurt: milli(row.output), loss: milli(row.loss) }));
  const completion = Number(big(data.deliveryProgress?.delivered));
  const expected = Number(big(data.expectedMilk?.customers));

  return <div className="content">
    <PageHeader title={`${greeting()}, ${session.name}`} description={`Business date ${data.businessDate} · figures use posted records only`} actions={<DateFilter />} />
    <nav className="quick-actions" aria-label="Quick actions">
      <Link className="button secondary" href="/quick-entry"><Truck size={17}/> Record Milk Procurement</Link>
      <Link className="button secondary" href="/deliveries"><Milk size={17}/> Post Daily Deliveries</Link>
      <Link className="button secondary" href="/sales"><ShoppingBasket size={17}/> New Shop Sale</Link>
      <Link className="button secondary" href="/expenses"><ReceiptText size={17}/> Add Expense</Link>
      <Link className="button secondary" href="/production"><Factory size={17}/> Create Yogurt Batch</Link>
    </nav>

    <section aria-labelledby="executive-summary">
      <SectionHeader title="Executive summary" description="Financial position for the selected period; balances are current." />
      <div className="executive-grid">
        <MetricCard label="Revenue" value={formatPKR(revenue)} note="Shop sales and household deliveries" tone="success" />
        <MetricCard label="Gross profit (estimated)" value={formatPKR(grossProfit)} note="Revenue − Milk procurement cost" tone={grossProfit >= 0n ? "success" : "danger"} />
        <MetricCard label="Operating expenses" value={formatPKR(expenses)} note="Posted expense transactions" tone="danger" />
        <MetricCard label="Operating result (estimated)" value={formatPKR(operatingResult)} note="Gross profit − operating expenses" tone={operatingResult >= 0n ? "brand" : "danger"} />
        <MetricCard label="Customer collections" value={formatPKR(customerCollections)} note={`${Number(big(data.customerPayments?.count))} payments received`} tone="brand" />
        <MetricCard label="Customer receivables" value={formatPKR(big(data.receivables?.balance))} note="Current amount to collect" tone="info" />
        <MetricCard label="Vendor payables" value={formatPKR(big(data.payables?.balance))} note="Current amount to pay" tone="warning" />
      </div>
    </section>

    <div className="dashboard-sections">
      <section><SectionHeader title="Sales & customers" description="Revenue, delivery completion and collection priorities."/><div className="chart-grid">
        <ChartCard title="Revenue and expenses trend" description="Daily posted value in PKR." summary={`${dailyData.length} business days contain posted activity.`}>{dailyData.length ? <TrendChart data={dailyData} keys={[{key:"revenue",label:"Revenue"},{key:"expenses",label:"Expenses",color:"#dc2626"}]} moneyValues/> : <EmptyState title="No trend yet" description="Posted sales and expenses will appear here."/>}</ChartCard>
        <ChartCard title="Revenue by channel" description="Shop sales versus household deliveries." summary={`${data.revenueComposition.length} revenue channels have posted activity.`}>{data.revenueComposition.length ? <CompositionChart data={data.revenueComposition.map(row => ({name:name(row._id),value:paisa(row.amount)}))} moneyValues/> : <EmptyState title="No revenue yet" description="Post a sale or delivery to see this chart."/>}</ChartCard>
        <ChartCard title="Households delivered" description="Delivered versus skipped or still expected." summary={`${completion} of ${expected} active households were delivered.`}><CompositionChart data={[{name:"Delivered",value:completion},{name:"Skipped / remaining",value:Math.max(expected-completion,0)}]}/></ChartCard>
        <ChartCard title="Highest customer balances" description="Customers requiring collection attention." summary={`${customerBalances.length} customer balances are shown.`}>{customerBalances.length ? <RankingChart data={customerBalances} moneyValues/> : <EmptyState title="No outstanding balances" description="Customer receivables are clear."/>}</ChartCard>
      </div></section>

      <section><SectionHeader title="Vendors & procurement" description="Daily intake, cost and vendor payment priorities."/><div className="chart-grid">
        <ChartCard title="Milk purchased by day" description="Posted Milk procurement in liters." summary={`${procurement.reduce((sum,row)=>sum+Number(row.quantity),0).toFixed(1)} liters purchased in this period.`}>{procurement.length ? <TrendChart data={procurement} keys={[{key:"quantity",label:"Liters"}]}/> : <EmptyState title="No procurement" description="Posted Milk purchases will appear here."/>}</ChartCard>
        <ChartCard title="Highest vendor payables" description="Current balances requiring payment." summary={`${vendorBalances.length} vendor balances are shown.`}>{vendorBalances.length ? <RankingChart data={vendorBalances} moneyValues/> : <EmptyState title="No vendor payables" description="Vendor balances are clear."/>}</ChartCard>
      </div></section>

      <section><SectionHeader title="Inventory" description="Current product quantities and Milk movement composition."/><div className="chart-grid">
        <ChartCard title="Current stock by product" description="Quantities shown in each product's base unit." summary={`${stock.length} products currently have positive stock.`}>{stock.length ? <RankingChart data={stock}/> : <EmptyState title="No stock available" description="Receive inventory to populate current stock."/>}</ChartCard>
        <ChartCard title="Milk movement composition" description="Posted Milk movement quantities for this period." summary={`${data.milkFlow.length} movement types were posted.`}>{data.milkFlow.length ? <CompositionChart data={data.milkFlow.map(row=>({name:name(row._id),value:Math.abs(milli(row.quantity))}))}/> : <EmptyState title="No Milk movements" description="Procurement, sales, deliveries and production appear here."/>}</ChartCard>
      </div></section>

      <section><SectionHeader title="Yogurt & Kunda" description="Production input, output and processing loss."/><div className="chart-grid">
        <ChartCard title="Milk input, Yogurt output and loss" description="Daily production quantities in kilograms." summary={`${production.length} production days are shown.`}>{production.length ? <GroupedBarChart data={production} keys={[{key:"milk",label:"Milk input"},{key:"yogurt",label:"Yogurt output",color:"#2563eb"},{key:"loss",label:"Loss",color:"#dc2626"}]}/> : <EmptyState title="No Yogurt production" description="Posted batches will appear here."/>}</ChartCard>
        <ChartCard title="Expenses by category" description="Where operating cash was spent." summary={`${data.expenseCategories.length} expense categories have activity.`}>{data.expenseCategories.length ? <CompositionChart data={data.expenseCategories.map(row=>({name:name(row._id),value:paisa(row.amount)}))} moneyValues/> : <EmptyState title="No expenses" description="Posted expenses will appear here."/>}</ChartCard>
      </div></section>

      <section><SectionHeader title="Alerts & attention" description="Recent unread notifications and operational warnings."/><div className="card alert-stack">{data.alerts.length ? data.alerts.map(alert => {
        const content = <><span className={`dot severity-${String(alert.severity ?? "info")}`}/><div><b>{String(alert.title ?? "Operational alert")}</b><div className="subtitle">{String(alert.message ?? "Review this item")}</div><span className="badge">{name(alert.category)}</span></div></>;
        return alert.relatedHref ? <Link className="alert alert-link" key={alert._id.toString()} href={String(alert.relatedHref)}>{content}</Link> : <div className="alert" key={alert._id.toString()}>{content}</div>;
      }) : <EmptyState title="No open alerts" description="There are no operational exceptions requiring attention."/>}<div className="toolbar"><Link className="button secondary" href="/notifications">Open Notification Center</Link></div></div></section>
    </div>
  </div>;
}
