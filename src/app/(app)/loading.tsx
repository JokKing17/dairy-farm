export default function Loading() {
  return (
    <div className="content" style={{ opacity: 0.5, pointerEvents: "none" }}>
      <div className="customer-heading"><div><div className="title">Loading…</div></div></div>
      <div className="grid kpis" style={{ marginTop: "var(--s-6)" }}>
        {[1, 2, 3, 4].map((i) => <article key={i} className="card"><div className="kpi-label">&nbsp;</div><div className="kpi-value" style={{ background: "var(--line)", borderRadius: 8, height: 36 }}>&nbsp;</div></article>)}
      </div>
      <div className="card" style={{ height: 200 }} />
    </div>
  );
}
