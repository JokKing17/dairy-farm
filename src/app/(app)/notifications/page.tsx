import Link from "next/link";
import { AlertTriangle, Bell, CheckCircle2, Circle, CreditCard, Factory, PackageOpen, ReceiptText, Search, ShoppingBasket, Truck, Users, WalletCards } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { DateFilter } from "@/components/date-filter";
import { EmptyState, FilterToolbar, MetricCard, PageHeader, SectionHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { businessDateFilter } from "@/lib/date-utils";
import { escapedSearchPattern, normalizeSearchQuery } from "@/lib/search";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

export const dynamic = "force-dynamic";

const categories = [
  ["all", "All Categories"],
  ["vendor", "Vendor Notifications"],
  ["milk_procurement", "Milk Procurement"],
  ["inventory", "Inventory Alerts"],
  ["low_stock", "Low Stock Alerts"],
  ["household_deliveries", "Household Deliveries"],
  ["shop_sales", "Shop Sales"],
  ["credit_customers", "Credit Customers"],
  ["vendor_payments", "Vendor Payments"],
  ["customer_payments", "Customer Payments"],
  ["expenses", "Expenses"],
  ["system", "System Alerts"],
] as const;

const iconByCategory: Record<string, typeof Bell> = {
  vendor: Users,
  milk_procurement: Truck,
  inventory: PackageOpen,
  low_stock: AlertTriangle,
  household_deliveries: Factory,
  shop_sales: ShoppingBasket,
  credit_customers: WalletCards,
  vendor_payments: CreditCard,
  customer_payments: CreditCard,
  expenses: ReceiptText,
  system: Bell,
};

const label = (value: unknown) => categories.find(([key]) => key === value)?.[1] ?? String(value ?? "System Alerts");
const title = (value: unknown) => String(value ?? "system").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
const relativeTime = (date: Date) => {
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diff / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
};

export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; q?: string; category?: string; status?: string; sort?: string }> }) {
  const filters = await searchParams;
  const q = normalizeSearchQuery(filters.q);
  const category = categories.some(([key]) => key === filters.category) ? filters.category! : "all";
  const status = filters.status === "read" || filters.status === "unread" ? filters.status : "all";
  const sort = filters.sort === "oldest" ? "oldest" : "newest";
  const match: Record<string, unknown> = {};
  const dateFilter = businessDateFilter(filters.from, filters.to);
  if (dateFilter) {
    const businessDate = dateFilter.businessDate as Record<string, unknown>;
    match.createdAt = {
      ...(businessDate.$gte ? { $gte: new Date(`${businessDate.$gte}T00:00:00Z`) } : {}),
      ...(businessDate.$lt ? { $lt: new Date(`${businessDate.$lt}T00:00:00Z`) } : {}),
    };
  }
  if (category !== "all") match.category = category;
  if (status === "read") match.status = "read";
  if (status === "unread") match.status = { $ne: "read" };
  const searchPattern = escapedSearchPattern(q);
  if (searchPattern) match.$or = [{ title: searchPattern }, { message: searchPattern }, { category: searchPattern }, { relatedType: searchPattern }];

  const database = await db();
  const [items, unread, total, highPriority] = await Promise.all([
    database.collection("notifications").find(match).sort({ createdAt: sort === "newest" ? -1 : 1 }).limit(100).toArray(),
    database.collection("notifications").countDocuments({ status: { $ne: "read" } }),
    database.collection("notifications").countDocuments(match),
    database.collection("notifications").countDocuments({ ...match, status: { $ne: "read" }, priority: { $in: ["high", "critical"] } }),
  ]);

  return (
    <div className="content">
      <AutoRefresh />
      <PageHeader title="Notification Center" description="A centralized operational inbox for alerts, warnings, payments, inventory, sales and system events." actions={<><DateFilter/><form action={markAllNotificationsRead}><button className="button secondary">Mark all as read</button></form></>}/>
      <div className="executive-grid">
        <MetricCard label="Unread" value={String(unread)} note="Open notifications" tone={unread ? "warning" : "success"}/>
        <MetricCard label="Showing" value={String(total)} note="Matching current filters" tone="info"/>
        <MetricCard label="High priority" value={String(highPriority)} note="Needs attention" tone={highPriority ? "danger" : "success"}/>
      </div>
      <SectionHeader title="Notifications" description="Filter, search and open the related business module."/>
      <form>
        <input type="hidden" name="from" value={filters.from ?? ""}/>
        <input type="hidden" name="to" value={filters.to ?? ""}/>
        <FilterToolbar>
          <label className="search-field"><span className="sr-only">Search notifications</span><Search size={17}/><input name="q" defaultValue={q} placeholder="Search title, details or module" type="search"/></label>
          <select name="category" defaultValue={category}>{categories.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>
          <select name="status" defaultValue={status}><option value="all">All Status</option><option value="unread">Unread</option><option value="read">Read</option></select>
          <select name="sort" defaultValue={sort}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
          <button className="button secondary">Apply</button>
        </FilterToolbar>
      </form>
      <div className="notification-list">
        {items.length ? items.map((item) => {
          const Icon = iconByCategory[String(item.category ?? "system")] ?? Bell;
          const unreadItem = item.status !== "read";
          const createdAt = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
          return (
            <article key={item._id.toString()} className={`notification-card notification-${String(item.severity ?? "info")} ${unreadItem ? "notification-unread" : ""}`}>
              <div className="notification-icon"><Icon size={20}/></div>
              <div className="notification-body">
                <div className="notification-meta">
                  <span className="badge">{label(item.category)}</span>
                  <span className={`badge priority-${String(item.priority ?? "medium")}`}>{title(item.priority)}</span>
                  {unreadItem ? <span className="unread-dot"><Circle size={8} fill="currentColor"/> Unread</span> : <span className="read-dot"><CheckCircle2 size={14}/> Read</span>}
                  <time>{relativeTime(createdAt)}</time>
                </div>
                <h2>{String(item.title ?? "Notification")}</h2>
                <p>{String(item.message ?? "Review this notification.")}</p>
                <div className="toolbar">
                  {item.relatedHref ? <Link className="button secondary" href={String(item.relatedHref)}>Open module</Link> : null}
                  {unreadItem ? <form action={markNotificationRead}><input type="hidden" name="id" value={item._id.toString()}/><button className="button ghost">Mark as read</button></form> : null}
                </div>
              </div>
            </article>
          );
        }) : <div className="card table-card"><EmptyState title="No notifications" description="You are all caught up. New operational events will appear here."/></div>}
      </div>
    </div>
  );
}
