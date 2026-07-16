import { CalendarDays, Search, Wifi } from "lucide-react";
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
            <button className="button secondary" type="button"><Search size={14} /> Search</button>
            <span className="subtitle"><Wifi size={13} /> Connected</span>
          </div>
          <div className="toolbar">
            <button className="button secondary" type="button"><CalendarDays size={14} /> Today</button>
            <span className="badge">{session.name} · {session.role}</span>
            <form action={logout}><button className="button secondary">Log out</button></form>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
