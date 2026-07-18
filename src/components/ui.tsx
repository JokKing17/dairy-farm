import type { ReactNode } from "react";
import { AlertCircle, Inbox, Search } from "lucide-react";

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header"><div><h1 className="title">{title}</h1><p className="subtitle">{description}</p></div>{actions ? <div className="page-actions">{actions}</div> : null}</header>;
}

export function SectionHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="section-header"><div><h2 className="section-title">{title}</h2>{description ? <p className="subtitle">{description}</p> : null}</div>{actions}</div>;
}

export function MetricCard({ label, value, note, tone = "brand" }: { label: string; value: ReactNode; note?: string; tone?: "brand" | "success" | "warning" | "danger" | "info" }) {
  return <article className={`metric-card metric-${tone}`}><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div>{note ? <div className="kpi-note">{note}</div> : null}</article>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon" aria-hidden="true"><Inbox size={22} /></span><b>{title}</b><span>{description}</span>{action}</div>;
}

export function ErrorState({ title = "We could not load this page", description, action }: { title?: string; description: string; action?: ReactNode }) {
  return <div className="state-message state-error" role="alert"><AlertCircle /><div><b>{title}</b><p>{description}</p>{action}</div></div>;
}

export function SearchField({ name = "q", defaultValue, placeholder, label = "Search records" }: { name?: string; defaultValue?: string; placeholder: string; label?: string }) {
  return <label className="search-field"><span className="sr-only">{label}</span><Search size={17} aria-hidden="true" /><input name={name} defaultValue={defaultValue} placeholder={placeholder} type="search" /></label>;
}

export function FilterToolbar({ children }: { children: ReactNode }) { return <div className="filter-toolbar">{children}</div>; }
export function DataTableContainer({ children }: { children: ReactNode }) { return <div className="card table-card"><div className="table-scroll">{children}</div></div>; }
