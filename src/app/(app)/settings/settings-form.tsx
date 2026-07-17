"use client";
import { useActionState } from "react";
import { saveSettings, type SettingsState } from "./actions";

const fields = [
  ["Business name", "businessName"], ["Address", "address"],
  ["Phone / WhatsApp", "phone"], ["Time zone", "timezone"],
  ["Receipt prefix", "invoicePrefix"], ["Closing time", "closingTime"],
  ["Allowed backdate days", "allowedBackdateDays"],
  ["Customer milk rate", "customerRate"], ["Shop milk rate", "shopRate"],
  ["Yogurt Milk ratio parts", "yogurtAutomaticMilkRatioParts"],
  ["Yogurt output ratio parts", "yogurtAutomaticOutputRatioParts"],
  ["Yield tolerance (milli; 20 = 2 points)", "yogurtYieldToleranceMilli"],
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
    <div className="field"><label htmlFor="yogurtDefaultProductionMode">Default Yogurt production mode</label><select id="yogurtDefaultProductionMode" name="yogurtDefaultProductionMode" defaultValue={settings.yogurtDefaultProductionMode}><option value="automatic">Automatic</option><option value="manual">Manual</option></select></div>
    <div className="field"><label htmlFor="milkInventoryUnit">Fresh Milk inventory unit</label><select id="milkInventoryUnit" name="milkInventoryUnit" defaultValue={settings.milkInventoryUnit}><option value="liter">Liter</option><option value="kilogram">Kilogram</option></select></div>
    <div className="field"><label htmlFor="milkDensityMilliKgPerLiter">Milk density (kg per liter; required for liter inventory)</label><input id="milkDensityMilliKgPerLiter" name="milkDensityMilliKgPerLiter" defaultValue={settings.milkDensityMilliKgPerLiter}/></div>
    <input type="hidden" name="currency" value="PKR" />
    <button className="button" disabled={pending}>{pending ? "Saving..." : "Save settings"}</button>
  </form>;
}
