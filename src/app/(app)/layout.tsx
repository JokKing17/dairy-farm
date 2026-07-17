import { CalendarDays, Search } from "lucide-react";
import Link from "next/link";
import { ConnectionStatus } from "@/components/connection-status";
import { Sidebar } from "@/components/sidebar";
import { requireSession } from "@/lib/auth";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        <header className="topbar">
          <div className="toolbar">
            <Link className="button secondary" href="/search"><Search size={14} /> Search</Link>
            <ConnectionStatus />
          </div>
          <div className="toolbar">
            <Link className="button secondary" href="/dashboard"><CalendarDays size={14} /> Today</Link>
            <span className="badge">{session.name} · {session.role}</span>
            <form action={logout}><button className="button secondary">Log out</button></form>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
