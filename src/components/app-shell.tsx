"use client";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Sidebar } from "./sidebar";

const titles: Record<string, string> = { dashboard: "Dashboard", "quick-entry": "Quick Milk Entry", vendors: "Vendors", customers: "Customers", deliveries: "Daily Deliveries", sales: "Shop Sales", inventory: "Inventory", production: "Yogurt / Kunda", expenses: "Expenses", cashbook: "Cashbook", reports: "Analytics & Reports", notifications: "Notifications", settings: "Settings" };

export function AppShell({ children, user }: { children: React.ReactNode; user: { name: string; role: string } }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const segment = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    document.body.classList.toggle("drawer-open", open);
    return () => { window.removeEventListener("keydown", close); document.body.classList.remove("drawer-open"); };
  }, [open]);
  return <div className="shell">
    <button className={`sidebar-backdrop ${open ? "is-open" : ""}`} aria-label="Close navigation" onClick={() => setOpen(false)} />
    <Sidebar user={user} open={open} onNavigate={() => setOpen(false)} />
    <main className="main" id="main-content">
      <header className="mobile-header"><button className="icon-button" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open}><Menu /></button><b>{titles[segment] ?? "DairyFlow"}</b></header>
      {children}
    </main>
  </div>;
}
