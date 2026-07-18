"use client";
import { useActionState } from "react";
import { saveSettings, type SettingsState } from "./actions";

type Settings = Record<string, string | number>;
function Field({ settings, name, label, help, type = "text" }: { settings: Settings; name: string; label: string; help?: string; type?: string }) {
  return <div className="field"><label htmlFor={name}>{label}</label><input id={name} name={name} type={type} defaultValue={settings[name] ?? ""} required/>{help ? <small className="field-help">{help}</small> : null}</div>;
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveSettings, {} as SettingsState);
  return <form action={action} className="settings-form">
    {state.error ? <div className="form-error form-full" role="alert">{state.error}</div> : null}
    {state.success ? <div className="form-success form-full" role="status">{state.success}</div> : null}

    <section className="card settings-section"><div className="settings-section-heading"><h2>Business identity</h2><p>Details used across receipts and business records.</p></div><div className="formgrid">
      <Field settings={settings} name="businessName" label="Business name"/>
      <Field settings={settings} name="phone" label="Phone / WhatsApp"/>
      <Field settings={settings} name="address" label="Business address"/>
      <Field settings={settings} name="invoicePrefix" label="Receipt prefix" help="Short code placed before new transaction numbers."/>
      <Field settings={settings} name="timezone" label="Time zone" help="Business dates use Asia/Karachi unless intentionally changed."/>
    </div></section>

    <section className="card settings-section"><div className="settings-section-heading"><h2>Customer and Shop rates</h2><p>Default Milk selling rates. Customer-specific history still takes priority.</p></div><div className="formgrid">
      <Field settings={settings} name="customerRate" label="Household Milk rate (PKR)"/>
      <Field settings={settings} name="shopRate" label="Shop Milk rate (PKR)"/>
    </div></section>

    <section className="card settings-section"><div className="settings-section-heading"><h2>Yogurt production defaults</h2><p>Automatic mode preserves the standard 40 kg Milk to 34 kg Yogurt ratio.</p></div><div className="formgrid">
      <Field settings={settings} name="yogurtAutomaticMilkRatioParts" label="Milk ratio parts"/>
      <Field settings={settings} name="yogurtAutomaticOutputRatioParts" label="Yogurt output ratio parts"/>
      <Field settings={settings} name="yogurtYieldToleranceMilli" label="Yield tolerance" help="Stored in milli-points; 20 represents 2 percentage points."/>
      <div className="field"><label htmlFor="yogurtDefaultProductionMode">Default production mode</label><select id="yogurtDefaultProductionMode" name="yogurtDefaultProductionMode" defaultValue={settings.yogurtDefaultProductionMode}><option value="automatic">Automatic 40:34 ratio</option><option value="manual">Manual actual output</option></select></div>
    </div></section>

    <section className="card settings-section"><div className="settings-section-heading"><h2>Milk units and density</h2><p>Density is used only when converting liter inventory for production calculations.</p></div><div className="formgrid">
      <div className="field"><label htmlFor="milkInventoryUnit">Fresh Milk inventory unit</label><select id="milkInventoryUnit" name="milkInventoryUnit" defaultValue={settings.milkInventoryUnit}><option value="liter">Liter</option><option value="kilogram">Kilogram</option></select></div>
      <Field settings={settings} name="milkDensityMilliKgPerLiter" label="Milk density (kg per liter)" help="Required when inventory is stored in liters."/>
    </div></section>

    <section className="card settings-section"><div className="settings-section-heading"><h2>Egg tray and piece settings</h2><p>Tray-size changes apply only to future transaction snapshots.</p></div><div className="formgrid">
      <div className="field"><label htmlFor="eggsPerTray">Eggs per tray</label><input id="eggsPerTray" name="eggsPerTray" type="number" min="1" max="120" step="1" defaultValue={settings.eggsPerTray ?? 30} required/><label className="inline-check"><input type="checkbox" name="confirmEggConversionChange"/> I confirm a changed tray size applies only to future transactions</label></div>
      <Field settings={settings} name="eggPieceSellingPrice" label="Selling price per Egg piece"/>
      <Field settings={settings} name="eggTraySellingPrice" label="Selling price per Egg tray"/>
      <div className="field"><label htmlFor="eggDefaultSaleUnit">Default Shop Sale unit</label><select id="eggDefaultSaleUnit" name="eggDefaultSaleUnit" defaultValue={settings.eggDefaultSaleUnit ?? "piece"}><option value="piece">Piece</option><option value="tray">Tray</option></select></div>
    </div></section>

    <section className="card settings-section"><div className="settings-section-heading"><h2>Operational controls</h2><p>Controls that affect posting dates and daily operations.</p></div><div className="formgrid">
      <Field settings={settings} name="closingTime" label="Closing time"/>
      <Field settings={settings} name="allowedBackdateDays" label="Allowed backdate days" type="number"/>
    </div></section>
    <input type="hidden" name="currency" value="PKR"/>
    <div className="settings-save"><button className="button" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button></div>
  </form>;
}
