"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChartNoAxesCombined, Factory, LayoutDashboard, LogOut, Milk, ReceiptText, Settings, ShoppingBasket, Truck, Users, WalletCards, Warehouse, X, Zap } from "lucide-react";
import { logout } from "@/app/login/actions";

const groups = [
  { name: "Overview", items: [["Dashboard", "/dashboard", LayoutDashboard], ["Quick Milk Entry", "/quick-entry", Zap]] },
  { name: "People", items: [["Vendors", "/vendors", Truck], ["Customers", "/customers", Users]] },
  { name: "Sales & Operations", items: [["Daily Deliveries", "/deliveries", Milk], ["Shop Sales", "/sales", ShoppingBasket], ["Inventory", "/inventory", Warehouse], ["Yogurt / Kunda", "/production", Factory]] },
  { name: "Finance", items: [["Expenses", "/expenses", ReceiptText], ["Cashbook", "/cashbook", WalletCards], ["Analytics & Reports", "/reports", ChartNoAxesCombined]] },
  { name: "System", items: [["Notifications", "/notifications", Bell], ["Settings", "/settings", Settings]] },
] as const;

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  return <aside className={`sidebar ${open ? "is-open" : ""}`} aria-label="Application sidebar">
    <div className="brand"><span className="brandmark"><Milk size={20} /></span><span>DairyFlow</span><button className="sidebar-close icon-button" onClick={onNavigate} aria-label="Close navigation"><X /></button></div>
    <nav className="nav" aria-label="Main navigation">
      {groups.map(group => <div key={group.name}><div className="navgroup">{group.name}</div>{group.items.map(([name, href, Icon]) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return <Link key={name} href={href} className={active ? "active" : undefined} onClick={onNavigate} aria-current={active ? "page" : undefined}><Icon size={18} /><span>{name}</span></Link>;
      })}</div>)}
    </nav>
    <footer className="sidebar-footer"><form action={logout}><button className="sidebar-logout" type="submit"><LogOut size={17} /> Log out</button></form></footer>
  </aside>;
}
