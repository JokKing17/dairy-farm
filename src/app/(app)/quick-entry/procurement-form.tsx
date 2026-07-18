"use client";
import { Search, X } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { formatMilli, formatPKR, multiplyQuantityRate, quantityToMilli, rupeesToPaisa } from "@/lib/money";
import { postProcurement, type ProcurementState } from "./actions";

type Vendor = { id: string; code: string; name: string; rate: string };
type Line = Vendor & { quantity: string; notes: string; noPickup: boolean };
const initialState: ProcurementState = {};

export function ProcurementForm({ vendors, today }: { vendors: Vendor[]; today: string }) {
  const [state, action, pending] = useActionState(postProcurement, initialState);
  const [date, setDate] = useState(today);
  const [shift, setShift] = useState(new Date().getHours() < 14 ? "morning" : "evening");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [reviewing, setReviewing] = useState(false);
  const [search, setSearch] = useState("");
  const handled = useRef<string | undefined>(undefined);
  const blank = () => vendors.map(vendor => ({ ...vendor, quantity: "", notes: "", noPickup: false }));
  const [lines, setLines] = useState<Line[]>(blank);
  const totals = useMemo(() => lines.reduce((sum, line) => {
    if (!line.quantity || line.noPickup) return sum;
    try {
      const quantity = quantityToMilli(line.quantity);
      return { quantity: sum.quantity + quantity, amount: sum.amount + multiplyQuantityRate(quantity, rupeesToPaisa(line.rate)) };
    } catch { return sum; }
  }, { quantity: 0n, amount: 0n }), [lines]);
  const invalid = lines.some(line => line.quantity !== "" && !line.noPickup && !/^\d+(\.\d{1,3})?$/.test(line.quantity));
  const visible = lines.filter(line => `${line.name} ${line.code}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (state.result && handled.current !== state.result.transactionNo) {
      handled.current = state.result.transactionNo;
      setLines(vendors.map(vendor => ({ ...vendor, quantity: "", notes: "", noPickup: false })));
      setKey(crypto.randomUUID());
      setReviewing(false);
    }
  }, [state.result, vendors]);

  const payload = JSON.stringify({ businessDate: date, shift, idempotencyKey: key, lines: lines.map(({ id, quantity, notes, noPickup }) => ({ vendorId: id, quantity, notes, noPickup })) });
  return <form action={action} className="card table-card">
    <input type="hidden" name="payload" value={payload}/>
    <div className="toolbar procurement-toolbar"><div className="toolbar"><input type="date" value={date} onChange={event => setDate(event.target.value)}/><select value={shift} onChange={event => setShift(event.target.value)}><option value="morning">Morning</option><option value="evening">Evening</option><option value="custom">Custom</option></select></div><span className="badge">{lines.length} active vendors</span></div>
    {state.error ? <div className="form-error" role="alert">{state.error}</div> : null}
    {state.result ? <div className="form-success"><b>Receipt {state.result.transactionNo}</b><span>{formatPKR(BigInt(state.result.totalAmountPaisa))}</span><button type="button" className="button secondary" onClick={() => window.print()}>Print</button></div> : null}
    <div className="list-search-row"><label className="search-field"><span className="sr-only">Search active vendors</span><Search size={17} aria-hidden="true"/><input type="search" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Search vendor name or code"/>{search ? <button type="button" className="search-clear" onClick={() => setSearch("")} aria-label="Clear vendor search"><X size={16}/></button> : null}</label><span className="result-count">{visible.length} of {lines.length} vendors visible</span></div>
    <div className="table-scroll"><table className="table"><thead><tr><th>Vendor</th><th>Quantity (L)</th><th>Rate / L</th><th>Amount</th><th>Notes</th><th>No pickup</th></tr></thead><tbody>{lines.map((line, index) => {
      let amount = 0n;
      try { amount = line.quantity ? multiplyQuantityRate(quantityToMilli(line.quantity), rupeesToPaisa(line.rate)) : 0n; } catch {}
      const bad = line.quantity !== "" && !/^\d+(\.\d{1,3})?$/.test(line.quantity);
      if (!`${line.name} ${line.code}`.toLowerCase().includes(search.toLowerCase())) return null;
      return <tr key={line.id}><td><b>{line.name}</b><div className="subtitle">{line.code}</div></td><td><input inputMode="decimal" value={line.quantity} disabled={line.noPickup} aria-invalid={bad} onChange={event => setLines(current => current.map((item, position) => position === index ? { ...item, quantity: event.target.value } : item))}/>{bad ? <small className="field-error">Enter liters with up to 3 decimals.</small> : null}</td><td><input value={line.rate} readOnly/></td><td>{formatPKR(amount)}</td><td><input value={line.notes} onChange={event => setLines(current => current.map((item, position) => position === index ? { ...item, notes: event.target.value } : item))}/></td><td><input type="checkbox" checked={line.noPickup} onChange={event => setLines(current => current.map((item, position) => position === index ? { ...item, noPickup: event.target.checked, quantity: event.target.checked ? "" : item.quantity } : item))}/></td></tr>;
    })}</tbody></table></div>
    <div className="procurement-totals"><span><small>Total Milk</small><b>{formatMilli(totals.quantity)} L</b></span><span><small>Total cost</small><b>{formatPKR(totals.amount)}</b></span><button type="button" className="button" disabled={pending || invalid || totals.quantity === 0n} onClick={() => setReviewing(true)}>Review &amp; post batch</button></div>
    {reviewing ? <div className="review-dialog" role="dialog" aria-modal="true"><div className="card review-card"><div className="section-title">Review Milk received</div><p>{date} · {shift}</p>{lines.filter(line => line.quantity && !line.noPickup).map(line => <div className="review-line" key={line.id}><span>{line.name}</span><b>{line.quantity} L · {formatPKR(multiplyQuantityRate(quantityToMilli(line.quantity), rupeesToPaisa(line.rate)))}</b></div>)}<div className="review-total"><span>Grand total</span><b>{formatPKR(totals.amount)}</b></div><div className="toolbar"><button type="button" className="button secondary" onClick={() => setReviewing(false)}>Go back</button><button className="button" disabled={pending}>{pending ? "Posting…" : "Confirm and post"}</button></div></div></div> : null}
  </form>;
}
