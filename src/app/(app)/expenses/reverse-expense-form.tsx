"use client";

import { useActionState, useState } from "react";
import { reverseExpenseAction, type ReverseExpenseState } from "./actions";

const initialState: ReverseExpenseState = {};

export function ReverseExpenseForm({ transactionNo }: { transactionNo: string }) {
  const [state, action, pending] = useActionState(reverseExpenseAction, initialState);
  const [open, setOpen] = useState(false);

  if (state.error) {
    return <div className="form-error" role="alert" style={{ fontSize: 12 }}>{state.error}</div>;
  }

  if (!open) {
    return <button className="button secondary" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => setOpen(true)}>Reverse</button>;
  }

  return (
    <form action={action} style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <input type="hidden" name="transactionNo" value={transactionNo} />
      <input name="reason" type="text" placeholder="Reason…" required minLength={5} style={{ fontSize: 12, padding: "2px 6px", width: 140 }} />
      <button className="button" style={{ fontSize: 12, padding: "2px 8px" }} disabled={pending}>{pending ? "…" : "Confirm"}</button>
      <button type="button" className="button secondary" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => { setOpen(false); state.error = undefined; }}>Cancel</button>
    </form>
  );
}
