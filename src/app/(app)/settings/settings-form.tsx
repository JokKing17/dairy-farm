"use client";
import { useActionState } from "react";
import { saveSettings, type SettingsState } from "./actions";

const fields = [
  ["Business name", "businessName"], ["Address", "address"],
  ["Phone / WhatsApp", "phone"], ["Time zone", "timezone"],
  ["Receipt prefix", "invoicePrefix"], ["Closing time", "closingTime"],
  ["Allowed backdate days", "allowedBackdateDays"],
  ["Customer milk rate", "customerRate"], ["Shop milk rate", "shopRate"],
] as const;

export function SettingsForm({ settings }: { settings: Record<string, string | number> }) {
  const [state, action, pending] = useActionState(saveSettings, {} as SettingsState);
  return <form action={action} className="card formgrid" style={{ marginTop: 22 }}>
    {state.error ? <div className="form-error">{state.error}</div> : null}
    {state.success ? <div className="form-success">{state.success}</div> : null}
    {fields.map(([label, name]) => <div className="field" key={name}>
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} defaultValue={settings[name] ?? ""} required />
    </div>)}
    <input type="hidden" name="currency" value="PKR" />
    <button className="button" disabled={pending}>{pending ? "Saving..." : "Save settings"}</button>
  </form>;
}
