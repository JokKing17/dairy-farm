"use client";

import { useActionState } from "react";
import { createVendor, type VendorActionState } from "./actions";

const initialState: VendorActionState = {};

export function VendorForm() {
  const [state, action, pending] = useActionState(createVendor, initialState);
  return (
    <form action={action} className="card formgrid vendor-form">
      <div className="field"><label htmlFor="code">Vendor code</label><input id="code" name="code" required placeholder="V-001" /></div>
      <div className="field"><label htmlFor="name">Vendor name</label><input id="name" name="name" required /></div>
      <div className="field"><label htmlFor="phone">Phone</label><input id="phone" name="phone" /></div>
      <div className="field"><label htmlFor="whatsapp">WhatsApp</label><input id="whatsapp" name="whatsapp" /></div>
      <div className="field"><label htmlFor="openingBalance">Opening payable (PKR)</label><input id="openingBalance" name="openingBalance" inputMode="decimal" defaultValue="0" /></div>
      <div className="field"><label htmlFor="milkRate">Milk rate / liter (PKR)</label><input id="milkRate" name="milkRate" inputMode="decimal" required /></div>
      <div className="field"><label htmlFor="address">Address / village</label><input id="address" name="address" /></div>
      <div className="field"><label htmlFor="notes">Notes</label><input id="notes" name="notes" /></div>
      <div>{state.error ? <div className="form-error" role="alert">{state.error}</div> : null}{state.success ? <div className="form-success">{state.success}</div> : null}<button className="button" disabled={pending}>{pending ? "Saving…" : "Add vendor"}</button></div>
    </form>
  );
}
