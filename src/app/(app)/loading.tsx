export default function Loading() {
  return <div className="content loading-state" aria-busy="true" aria-label="Loading page">
    <div className="skeleton skeleton-title" />
    <div className="skeleton skeleton-text" />
    <div className="executive-grid loading-grid">{[1,2,3,4,5,6].map(item=><div className="skeleton skeleton-card" key={item}/>)}</div>
    <div className="skeleton skeleton-panel" />
  </div>;
}
