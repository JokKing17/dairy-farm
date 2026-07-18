"use client";

import { useActionState, useState } from "react";
import { reverseExpenseAction, type ReverseExpenseState } from "./actions";

const initialState: ReverseExpenseState = {};

export function ReverseExpenseForm({ transactionNo }: { transactionNo: string }) {
  const [state, action, pending] = useActionState(reverseExpenseAction, initialState);
  const [open, setOpen] = useState(false);

  if (state.error) {
    return <div className="form-error" style={{ fontSize: "var(--text-xs)" }} role="alert">{state.error}</div>;
  }

  if (!open) {
    return <button className="button secondary small-button" onClick={() => setOpen(true)}>Reverse</button>;
  }

  return (
    <form action={action} className="inline-form">
      <input type="hidden" name="transactionNo" value={transactionNo} />
      <input name="reason" type="text" placeholder="Reason…" required minLength={5} className="small-button" style={{ width: 140 }} />
      <button className="button small-button" disabled={pending}>{pending ? "…" : "Confirm"}</button>
      <button type="button" className="button secondary small-button" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}
