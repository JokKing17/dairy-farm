"use client";

import { useActionState, useState } from "react";
import { createVendor, deactivateVendor, recordVendorPayment, updateVendor, type VendorActionState } from "./actions";
import { formatPKR } from "@/lib/money";

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

export type VendorRow = { id: string; code: string; name: string; phone: string; whatsapp: string; address: string; notes: string; active: boolean; milkRate: string; payablePaisa: string };

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

export function VendorPaymentForm({ vendor, today }: { vendor: VendorRow; today: string }) {
  const [state, action, pending] = useActionState(recordVendorPayment, initialState);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const payable = BigInt(vendor.payablePaisa || "0");
  return (
    <>
      <button className="button secondary" type="button" disabled={!vendor.active || payable <= 0n} onClick={() => { setKey(crypto.randomUUID()); setOpen(true); }}>
        Pay vendor
      </button>
      {open ? (
        <div className="review-dialog" role="dialog" aria-modal="true">
          <form action={action} className="card review-card">
            <input type="hidden" name="partyId" value={vendor.id} />
            <input type="hidden" name="idempotencyKey" value={key} />
            <div className="section-title">Record Vendor Payment</div>
            <p className="subtitle">{vendor.name} outstanding: {formatPKR(payable)}</p>
            {state.error ? <div className="form-error">{state.error}</div> : null}
            {state.success ? <div className="form-success">{state.success}</div> : null}
            <div className="field"><label>Payment date</label><input name="businessDate" type="date" defaultValue={today} required /></div>
            <div className="field"><label>Amount (PKR)</label><input name="amount" inputMode="decimal" required autoFocus /></div>
            <div className="field"><label>Payment method</label><select name="method" defaultValue="cash"><option value="cash">Cash</option><option value="bank">Bank</option><option value="easypaisa">Easypaisa</option><option value="jazzcash">JazzCash</option></select></div>
            <div className="field"><label>Notes</label><textarea name="notes" /></div>
            <div className="toolbar">
              <button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button className="button" disabled={pending}>{pending ? "Saving…" : "Save payment"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
