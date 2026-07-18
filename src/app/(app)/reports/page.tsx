import Link from "next/link";
import { db } from "@/lib/db";
import { addDays } from "@/lib/date-utils";
import { DateFilter } from "@/components/date-filter";
import { formatMilli, formatPKR, integerToBigInt } from "@/lib/money";
import { dashboard, karachiBusinessDate } from "@/lib/queries";
import { ChartCard, CompositionChart, GroupedBarChart, TrendChart, YieldLineChart } from "@/components/analytics-charts";
import { DataTableContainer, EmptyState, FilterToolbar, MetricCard, PageHeader, SearchField, SectionHeader } from "@/components/ui";
import { escapedSearchPattern, normalizeSearchQuery } from "@/lib/search";

export const dynamic = "force-dynamic";
const tabs = [
  ["overview","Overview"],["sales","Sales"],["customers","Customers"],["vendors","Vendors & Procurement"],
  ["inventory","Inventory"],["yogurt","Yogurt & Kunda"],["expenses","Expenses"],["cash","Cash & Transactions"],
] as const;
const big = (value: unknown) => integerToBigInt(value);
const paisa = (value: unknown) => Number(big(value))/100;
const milli = (value: unknown) => Number(big(value))/1000;
const title = (value: unknown) => String(value ?? "Unknown").replaceAll("_"," ").replace(/\b\w/g, letter=>letter.toUpperCase());

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{from?:string;to?:string;tab?:string;q?:string}> }) {
  const filters = await searchParams;
  const businessDate = karachiBusinessDate();
  const month = businessDate.slice(0,7);
  const from = filters.from ?? `${month}-01`;
  const inclusiveTo = filters.to ?? new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5,7)), 0)).toISOString().slice(0,10);
  const to = addDays(inclusiveTo,1);
  const tab = tabs.some(([key])=>key===filters.tab) ? filters.tab! : "overview";
  const database = await db();
  const q = normalizeSearchQuery(filters.q);
  const pattern = escapedSearchPattern(q) ?? undefined;
  const [summary, production, transactions] = await Promise.all([
    dashboard(from,inclusiveTo),
    database.collection("production_batches").aggregate([
      {$match:{businessDate:{$gte:from,$lt:to},status:"posted"}},
      {$project:{businessDate:1,batchNo:1,productionMode:1,milk:{$ifNull:["$actualMilkUsedMilli","$milkUsedMilli"]},output:{$ifNull:["$actualYogurtOutputMilli","$actualOutputMilli"]},loss:"$processingLossMilli",cost:"$totalProductionCostPaisa",profit:"$estimatedGrossProfitPaisa"}},
      {$sort:{businessDate:1}},
    ]).toArray(),
    database.collection("financial_transactions").find({businessDate:{$gte:from,$lt:to},status:"posted",...(pattern?{transactionNo:pattern}:{})}).sort({businessDate:-1}).limit(100).toArray(),
  ]);
  const productionChart = production.map(row=>({name:String(row.businessDate).slice(5),milk:milli(row.milk),yogurt:milli(row.output),loss:milli(row.loss),yield:milli(row.milk)>0?milli(row.output)/milli(row.milk)*100:0}));
  const dailyRevenue = summary.dailySales.map(row=>({name:String(row._id).slice(5),revenue:paisa(row.amount)}));
  const dailyPurchases = summary.dailyPurchases.map(row=>({name:String(row._id).slice(5),quantity:milli(row.quantity),cost:paisa(row.amount)}));
  const dailyExpenses = summary.dailyExpenses.map(row=>({name:String(row._id).slice(5),expenses:paisa(row.amount)}));

  return <div className="content">
    <PageHeader title="Analytics & Reports" description="Detailed performance from posted business records. Current month is selected by default." actions={<DateFilter/>}/>
    <nav className="report-tabs" aria-label="Report sections">{tabs.map(([key,label])=><Link key={key} className={tab===key?"active":""} href={{query:{...filters,tab:key}}}>{label}</Link>)}</nav>

    {tab==="overview" && <><SectionHeader title="Business overview" description="A compact summary for the selected period."/><div className="executive-grid">
      <MetricCard label="Revenue" value={formatPKR(big(summary.sales?.amount))} tone="success"/>
      <MetricCard label="Milk procurement" value={formatPKR(big(summary.purchases?.amount))} tone="warning"/>
      <MetricCard label="Expenses" value={formatPKR(big(summary.expenses?.amount))} tone="danger"/>
      <MetricCard label="Receivables" value={formatPKR(big(summary.receivables?.balance))} tone="info"/>
      <MetricCard label="Payables" value={formatPKR(big(summary.payables?.balance))} tone="warning"/>
      <MetricCard label="Open alerts" value={String(summary.alerts.length)} note="Current operational exceptions"/>
    </div><div className="chart-grid report-chart-grid"><ChartCard title="Revenue trend" description="Daily posted sales and delivery revenue." summary={`${dailyRevenue.length} active days.`}>{dailyRevenue.length?<TrendChart data={dailyRevenue} keys={[{key:"revenue",label:"Revenue"}]} moneyValues/>:<EmptyState title="No revenue" description="No posted revenue in this period."/>}</ChartCard><ChartCard title="Revenue composition" description="Shop sales versus household delivery revenue." summary={`${summary.revenueComposition.length} active channels.`}>{summary.revenueComposition.length?<CompositionChart data={summary.revenueComposition.map(row=>({name:title(row._id),value:paisa(row.amount)}))} moneyValues/>:<EmptyState title="No revenue" description="No posted revenue in this period."/>}</ChartCard></div></>}

    {tab==="sales" && <><SectionHeader title="Sales analysis" description="Revenue timing and channel composition."/><div className="chart-grid"><ChartCard title="Daily revenue" description="Posted revenue in PKR." summary={`${dailyRevenue.length} days with sales.`}>{dailyRevenue.length?<TrendChart data={dailyRevenue} keys={[{key:"revenue",label:"Revenue"}]} moneyValues/>:<EmptyState title="No sales" description="No posted sales in this period."/>}</ChartCard><ChartCard title="Sales channels" description="Shop sales and daily household deliveries." summary={`${summary.revenueComposition.length} channels.`}><CompositionChart data={summary.revenueComposition.map(row=>({name:title(row._id),value:paisa(row.amount)}))} moneyValues/></ChartCard></div></>}

    {tab==="customers" && <><SectionHeader title="Customer analysis" description="Collection priorities and delivery completion."/><div className="chart-grid"><ChartCard title="Highest outstanding balances" description="Current receivables by customer." summary={`${summary.customerBalances.length} customers shown.`}><CompositionChart data={summary.customerBalances.map(row=>({name:String(row.name),value:paisa(row.balance)}))} moneyValues/></ChartCard><ChartCard title="Delivery completion" description="Households served in the selected period." summary={`${Number(big(summary.deliveryProgress?.delivered))} delivered.`}><CompositionChart data={[{name:"Delivered",value:Number(big(summary.deliveryProgress?.delivered))},{name:"Skipped",value:Number(big(summary.deliveryProgress?.skipped))}]}/></ChartCard></div></>}

    {tab==="vendors" && <><SectionHeader title="Vendors & procurement" description="Milk intake volume, purchase cost and current payables."/><div className="chart-grid"><ChartCard title="Milk purchased by day" description="Daily liters received." summary={`${dailyPurchases.length} procurement days.`}><TrendChart data={dailyPurchases} keys={[{key:"quantity",label:"Liters"}]}/></ChartCard><ChartCard title="Procurement cost by day" description="Daily posted vendor cost." summary={`${dailyPurchases.length} procurement days.`}><TrendChart data={dailyPurchases} keys={[{key:"cost",label:"Cost"}]} moneyValues/></ChartCard></div></>}

    {tab==="inventory" && <><SectionHeader title="Inventory analysis" description="Current quantity and value composition from posted movements."/><div className="chart-grid"><ChartCard title="Current stock" description="Positive quantity by product." summary={`${summary.stock.length} products shown.`}><CompositionChart data={summary.stock.filter(row=>milli(row.quantity)>0).map(row=>({name:String(row.name),value:milli(row.quantity)}))}/></ChartCard><ChartCard title="Milk movement" description="Milk inflows and outflows by operation." summary={`${summary.milkFlow.length} movement types.`}><CompositionChart data={summary.milkFlow.map(row=>({name:title(row._id),value:Math.abs(milli(row.quantity))}))}/></ChartCard></div></>}

    {tab==="yogurt" && <><SectionHeader title="Yogurt & Kunda analysis" description="Yield, input, output, loss and batch economics."/><div className="executive-grid"><MetricCard label="Batches" value={String(production.length)}/><MetricCard label="Milk input" value={`${formatMilli(production.reduce((sum,row)=>sum+big(row.milk),0n))} kg`}/><MetricCard label="Yogurt output" value={`${formatMilli(production.reduce((sum,row)=>sum+big(row.output),0n))} kg`} tone="success"/></div><div className="chart-grid report-chart-grid"><ChartCard title="Actual yield versus standard" description="Daily actual yield with the 85% standard reference." summary={`${productionChart.length} production days.`}>{productionChart.length?<YieldLineChart data={productionChart}/>:<EmptyState title="No batches" description="No posted Yogurt batches in this period."/>}</ChartCard><ChartCard title="Milk, Yogurt and loss" description="Daily quantities in kilograms." summary={`${productionChart.length} production days.`}>{productionChart.length?<GroupedBarChart data={productionChart} keys={[{key:"milk",label:"Milk"},{key:"yogurt",label:"Yogurt",color:"#2563eb"},{key:"loss",label:"Loss",color:"#dc2626"}]}/>:<EmptyState title="No batches" description="No posted Yogurt batches in this period."/>}</ChartCard></div><DataTableContainer>{production.length?<table className="table"><thead><tr><th>Batch</th><th>Date</th><th>Mode</th><th>Milk</th><th>Yogurt</th><th>Loss</th><th>Cost</th><th>Est. profit</th></tr></thead><tbody>{production.map(row=><tr key={row._id.toString()}><td className="transaction-no">{String(row.batchNo??row._id)}</td><td>{String(row.businessDate)}</td><td>{title(row.productionMode)}</td><td>{formatMilli(big(row.milk))} kg</td><td>{formatMilli(big(row.output))} kg</td><td>{formatMilli(big(row.loss))} kg</td><td>{formatPKR(big(row.cost))}</td><td>{formatPKR(big(row.profit))}</td></tr>)}</tbody></table>:<EmptyState title="No production batches" description="Posted batches will appear here."/ >}</DataTableContainer></>}

    {tab==="expenses" && <><SectionHeader title="Expense analysis" description="Category composition and daily operating expense trend."/><div className="chart-grid"><ChartCard title="Expenses by category" description="Posted expense value in PKR." summary={`${summary.expenseCategories.length} categories.`}><CompositionChart data={summary.expenseCategories.map(row=>({name:title(row._id),value:paisa(row.amount)}))} moneyValues/></ChartCard><ChartCard title="Expense trend" description="Daily posted expense value." summary={`${dailyExpenses.length} days with expenses.`}><TrendChart data={dailyExpenses} keys={[{key:"expenses",label:"Expenses",color:"#dc2626"}]} moneyValues/></ChartCard></div></>}

    {tab==="cash" && <><SectionHeader title="Cash & transactions" description="Posted financial transaction drill-down."/><form><input type="hidden" name="tab" value="cash"/><input type="hidden" name="from" value={from}/><input type="hidden" name="to" value={inclusiveTo}/><FilterToolbar><SearchField defaultValue={filters.q} placeholder="Search transaction number"/><button className="button secondary">Search</button>{filters.q?<span className="result-count">{transactions.length} results</span>:null}</FilterToolbar></form><DataTableContainer>{transactions.length?<table className="table"><thead><tr><th>Transaction</th><th>Date</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead><tbody>{transactions.map(row=><tr key={row._id.toString()}><td className="transaction-no">{String(row.transactionNo)}</td><td>{String(row.businessDate)}</td><td>{title(row.kind)}</td><td className="numeric">{formatPKR(big(row.amountPaisa))}</td><td><span className="badge success">Posted</span></td></tr>)}</tbody></table>:<EmptyState title="No posted transactions" description="Try another date range or search."/ >}</DataTableContainer></>}
  </div>;
}
