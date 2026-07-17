"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="content"><div className="card degraded-banner" role="alert"><div><b>We could not load this page</b><span>Check the database connection, then try again. Your saved records were not changed.</span><button className="button" onClick={reset}>Try again</button></div></div></div>;
}
