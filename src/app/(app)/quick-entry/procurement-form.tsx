"use client";

import { useActionState, useMemo, useState } from "react";
import { formatPKR, multiplyQuantityRate, quantityToMilli, rupeesToPaisa } from "@/lib/money";
import { postProcurement, type ProcurementState } from "./actions";

type Vendor = { id: string; code: string; name: string; rate: string };
type Line = Vendor & { quantity: string; notes: string; noPickup: boolean };
const initialState: ProcurementState = {};

export function ProcurementForm({ vendors, today }: { vendors: Vendor[]; today: string }) {
  const [state, action, pending] = useActionState(postProcurement, initialState);
  const [date, setDate] = useState(today);
  const [shift, setShift] = useState("morning");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [lines, setLines] = useState<Line[]>(vendors.map((vendor) => ({ ...vendor, quantity: "", notes: "", noPickup: false })));
  const totals = useMemo(() => lines.reduce((result, line) => {
    if (!line.quantity || line.noPickup) return result;
    try { const quantity = quantityToMilli(line.quantity); return { quantity: result.quantity + quantity, amount: result.amount + multiplyQuantityRate(quantity, rupeesToPaisa(line.rate)) }; } catch { return result; }
  }, { quantity: 0n, amount: 0n }), [lines]);
  const payload = JSON.stringify({ businessDate: date, shift, idempotencyKey: key, lines: lines.map((line) => ({ vendorId: line.id, quantity: line.quantity, rate: line.rate, notes: line.notes, noPickup: line.noPickup })) });
  return <form action={action} className="card table-card"><input type="hidden" name="payload" value={payload} /><div className="toolbar procurement-toolbar"><div className="toolbar"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /><select value={shift} onChange={(event) => setShift(event.target.value)}><option value="morning">Morning</option><option value="evening">Evening</option><option value="custom">Custom</option></select></div><span className="badge">{lines.length} active vendors</span></div>{state.error ? <div className="form-error">{state.error}</div> : null}{state.success ? <div className="form-success">{state.success}</div> : null}<table className="table"><thead><tr><th>Vendor</th><th>Quantity (L)</th><th>Rate / L</th><th>Amount</th><th>Notes</th><th>No pickup</th></tr></thead><tbody>{lines.map((line, index) => { let amount = 0n; try { amount = line.quantity ? multiplyQuantityRate(quantityToMilli(line.quantity), rupeesToPaisa(line.rate)) : 0n; } catch {} return <tr key={line.id}><td><b>{line.name}</b><div className="subtitle">{line.code}</div></td><td><input inputMode="decimal" value={line.quantity} disabled={line.noPickup} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} /></td><td><input inputMode="decimal" value={line.rate} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, rate: event.target.value } : item))} /></td><td>{formatPKR(amount)}</td><td><input value={line.notes} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, notes: event.target.value } : item))} /></td><td><input type="checkbox" checked={line.noPickup} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, noPickup: event.target.checked, quantity: event.target.checked ? "" : item.quantity } : item))} /></td></tr>; })}</tbody></table><div className="procurement-totals"><span><small>Total milk</small><b>{totals.quantity / 1000n}.{(totals.quantity % 1000n).toString().padStart(3,"0")} L</b></span><span><small>Total cost</small><b>{formatPKR(totals.amount)}</b></span><button className="button" disabled={pending || totals.quantity === 0n} onClick={() => { if (state.success) setKey(crypto.randomUUID()); }}>{pending ? "Posting…" : "Review & post batch"}</button></div></form>;
}
