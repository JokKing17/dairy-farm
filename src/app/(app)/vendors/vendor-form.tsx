"use client";

import { useActionState } from "react";
import { createVendor, deactivateVendor, updateVendor, type VendorActionState } from "./actions";

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

export type VendorRow = { id: string; code: string; name: string; phone: string; whatsapp: string; address: string; notes: string; active: boolean; milkRate: string };

export function VendorActions({ vendor }: { vendor: VendorRow }) {
  const [updateState, updateAction, updating] = useActionState(updateVendor, initialState);
  const [deleteState, deleteAction, deleting] = useActionState(deactivateVendor, initialState);
  return (
    <details>
      <summary className="button secondary">Edit</summary>
      <div className="review-dialog" role="dialog" aria-modal="true">
        <form action={updateAction} className="card review-card">
          <input type="hidden" name="id" value={vendor.id} />
          <div className="section-title">Edit vendor</div>
          {updateState.error ? <div className="form-error">{updateState.error}</div> : null}
          {updateState.success ? <div className="form-success">{updateState.success}</div> : null}
          <div className="field"><label>Vendor code</label><input name="code" defaultValue={vendor.code} required /></div>
          <div className="field"><label>Vendor name</label><input name="name" defaultValue={vendor.name} required /></div>
          <div className="field"><label>Phone</label><input name="phone" defaultValue={vendor.phone} /></div>
          <div className="field"><label>WhatsApp</label><input name="whatsapp" defaultValue={vendor.whatsapp} /></div>
          <div className="field"><label>Milk rate / liter (PKR)</label><input name="milkRate" inputMode="decimal" defaultValue={vendor.milkRate} required /></div>
          <div className="field"><label>Address / village</label><input name="address" defaultValue={vendor.address} /></div>
          <div className="field"><label>Notes</label><textarea name="notes" defaultValue={vendor.notes} /></div>
          <input type="hidden" name="openingBalance" value="0" />
          <div className="toolbar"><button className="button" disabled={updating}>{updating ? "Saving…" : "Save changes"}</button></div>
        </form>
        {vendor.active ? (
          <form action={deleteAction} className="card review-card">
            <input type="hidden" name="id" value={vendor.id} />
            {deleteState.error ? <div className="form-error">{deleteState.error}</div> : null}
            {deleteState.success ? <div className="form-success">{deleteState.success}</div> : null}
            <p className="subtitle">Deactivate keeps historical procurement and ledger records intact.</p>
            <button className="button secondary" disabled={deleting} formAction={deleteAction} onClick={(event) => { if (!confirm(`Deactivate ${vendor.name}?`)) event.preventDefault(); }}>{deleting ? "Deactivating…" : "Deactivate vendor"}</button>
          </form>
        ) : null}
      </div>
    </details>
  );
}
