"use client";
import { useActionState } from "react";
import { saveSettings, type SettingsState } from "./actions";

const fields = [
  ["Business name", "businessName"],
  ["Address", "address"],
  ["Phone / WhatsApp", "phone"],
  ["Time zone", "timezone"],
  ["Receipt prefix", "invoicePrefix"],
  ["Closing time", "closingTime"],
  ["Allowed backdate days", "allowedBackdateDays"],
  ["Customer milk rate", "customerRate"],
  ["Shop milk rate", "shopRate"],
  ["Yogurt Milk ratio parts", "yogurtAutomaticMilkRatioParts"],
  ["Yogurt output ratio parts", "yogurtAutomaticOutputRatioParts"],
  ["Yield tolerance (milli; 20 = 2 points)", "yogurtYieldToleranceMilli"],
] as const;

export function SettingsForm({
  settings,
}: {
  settings: Record<string, string | number>;
}) {
  const [state, action, pending] = useActionState(
    saveSettings,
    {} as SettingsState,
  );
  return (
    <form action={action} className="card formgrid" style={{ marginTop: "var(--s-6)" }}>
      {state.error ? <div className="form-error">{state.error}</div> : null}
      {state.success ? (
        <div className="form-success">{state.success}</div>
      ) : null}
      {fields.map(([label, name]) => (
        <div className="field" key={name}>
          <label htmlFor={name}>{label}</label>
          <input
            id={name}
            name={name}
            defaultValue={settings[name] ?? ""}
            required
          />
        </div>
      ))}
      <div className="field">
        <label htmlFor="yogurtDefaultProductionMode">
          Default Yogurt production mode
        </label>
        <select
          id="yogurtDefaultProductionMode"
          name="yogurtDefaultProductionMode"
          defaultValue={settings.yogurtDefaultProductionMode}
        >
          <option value="automatic">Automatic</option>
          <option value="manual">Manual</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="milkInventoryUnit">Fresh Milk inventory unit</label>
        <select
          id="milkInventoryUnit"
          name="milkInventoryUnit"
          defaultValue={settings.milkInventoryUnit}
        >
          <option value="liter">Liter</option>
          <option value="kilogram">Kilogram</option>
        </select>
      </div>
    <div className="field">
      <label htmlFor="milkDensityMilliKgPerLiter">
          Milk density (kg per liter; required for liter inventory)
        </label>
        <input
          id="milkDensityMilliKgPerLiter"
          name="milkDensityMilliKgPerLiter"
          defaultValue={settings.milkDensityMilliKgPerLiter}
      />
    </div>
    <div className="section-title">Egg Settings</div>
    <div className="field">
      <label htmlFor="eggsPerTray">Eggs per tray</label>
      <input id="eggsPerTray" name="eggsPerTray" type="number" min="1" max="120" step="1" defaultValue={settings.eggsPerTray ?? 30} required />
      <label className="inline-check"><input type="checkbox" name="confirmEggConversionChange" /> I confirm a changed tray size applies only to future transactions</label>
    </div>
    <div className="field"><label htmlFor="eggPieceSellingPrice">Selling price per Egg piece</label><input id="eggPieceSellingPrice" name="eggPieceSellingPrice" inputMode="decimal" defaultValue={settings.eggPieceSellingPrice ?? ""} /></div>
    <div className="field"><label htmlFor="eggTraySellingPrice">Selling price per Egg tray</label><input id="eggTraySellingPrice" name="eggTraySellingPrice" inputMode="decimal" defaultValue={settings.eggTraySellingPrice ?? ""} /></div>
    <div className="field"><label htmlFor="eggDefaultSaleUnit">Default Shop Sale unit</label><select id="eggDefaultSaleUnit" name="eggDefaultSaleUnit" defaultValue={settings.eggDefaultSaleUnit ?? "piece"}><option value="piece">Piece</option><option value="tray">Tray</option></select></div>
      <input type="hidden" name="currency" value="PKR" />
      <button className="button" disabled={pending}>
        {pending ? "Saving..." : "Save settings"}
      </button>
    </form>
  );
}
