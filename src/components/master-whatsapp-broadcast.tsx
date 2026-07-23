"use client";

import { useState } from "react";

type BroadcastEntity = "vendors" | "customers";

export function MasterWhatsAppBroadcastButton({ entity }: { entity: BroadcastEntity }) {
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<{ sent: number; successful: number; failed: number; failedReasons: string[] } | null>(null);

  const handleClick = async () => {
    if (isSending) return;

    setIsSending(true);
    setProgress(5);
    setSummary(null);

    const progressTimer = window.setInterval(() => {
      setProgress((current) => Math.min(current + 8, 94));
    }, 450);

    try {
      const response = await fetch(`/api/whatsapp/broadcast?entity=${entity}`, { method: "POST" });
      const payload = await response.json();

      setSummary({
        sent: payload.total ?? 0,
        successful: payload.successful ?? 0,
        failed: payload.failed ?? 0,
        failedReasons: Array.isArray(payload.failureReasons) ? payload.failureReasons : [],
      });
      setProgress(100);
    } catch (error) {
      setSummary({
        sent: 0,
        successful: 0,
        failed: 1,
        failedReasons: [error instanceof Error ? error.message : String(error)],
      });
      setProgress(100);
    } finally {
      window.clearInterval(progressTimer);
      setIsSending(false);
    }
  };

  return (
    <div className="broadcast-wrapper">
      <button className="button" type="button" onClick={handleClick} disabled={isSending}>
        {isSending ? "Broadcasting…" : "Master WhatsApp"}
      </button>
      {(isSending || summary) ? (
        <div className="broadcast-status" aria-live="polite">
          <div className="progress-track"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>
          {summary ? (
            <div className="broadcast-summary">
              <div>Total recipients: {summary.sent}</div>
              <div>Successful deliveries: {summary.successful}</div>
              <div>Failed deliveries: {summary.failed}</div>
              {summary.failedReasons.length ? <div>Failure reasons: {summary.failedReasons.join(", ")}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
