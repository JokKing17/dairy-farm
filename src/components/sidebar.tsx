"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChartNoAxesCombined, Factory, LayoutDashboard, Milk, ReceiptText, Settings, ShoppingBasket, Truck, Users, WalletCards, Warehouse, Zap } from "lucide-react";

const groups = [
  { name: "Workspace", items: [["Dashboard", "/dashboard", LayoutDashboard], ["Quick Entry", "/quick-entry", Zap]] },
  { name: "Operations", items: [["Vendors", "/vendors", Truck], ["Customers", "/customers", Users], ["Daily Deliveries", "/deliveries", Milk], ["Shop Sales", "/sales", ShoppingBasket], ["Inventory", "/inventory", Warehouse], ["Production", "/production", Factory]] },
  { name: "Finance", items: [["Expenses", "/expenses", ReceiptText], ["Cash & Ledgers", "/cashbook", WalletCards], ["Reports", "/reports", ChartNoAxesCombined]] },
  { name: "System", items: [["Notifications", "/notifications", Bell], ["Settings", "/settings", Settings]] },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand"><b className="brandmark"><Milk size={20} /></b><span>DairyFlow</span></div>
      <nav className="nav" aria-label="Main navigation">
        {groups.map((group) => (
          <div key={group.name}>
            <div className="navgroup">{group.name}</div>
            {group.items.map(([name, href, Icon]) => (
              <Link key={name} href={href} className={pathname === href || pathname.startsWith(`${href}/`) ? "active" : undefined}>
                <Icon size={16} /><span>{name}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
