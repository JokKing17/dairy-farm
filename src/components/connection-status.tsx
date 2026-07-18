"use client";
import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
export function ConnectionStatus() {
  const [status, setStatus] = useState<"checking" | "connected" | "degraded" | "offline">("checking");
  useEffect(() => {
    const check = async () => {
      if (!navigator.onLine) return setStatus("offline");
      try { const response = await fetch("/api/health", { cache: "no-store" }); setStatus(response.ok ? "connected" : "degraded"); } catch { setStatus("offline"); }
    };
    void check(); window.addEventListener("online", check); window.addEventListener("offline", check);
    return () => { window.removeEventListener("online", check); window.removeEventListener("offline", check); };
  }, []);
  const label = status === "checking" ? "Checking connection…" : status === "connected" ? "Connected" : status === "degraded" ? "Database degraded" : "Offline";
  return <span className={`connection-status connection-${status}`}>{status === "connected" ? <Wifi /> : <WifiOff />}<span>{label}</span></span>;
}
