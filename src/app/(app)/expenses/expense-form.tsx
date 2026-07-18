"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { formatPKR, rupeesToPaisa } from "@/lib/money";
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS } from "@/lib/expense-constants";
import { createExpense, type ExpenseState } from "./actions";

const initialState: ExpenseState = {};

export function ExpenseForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(createExpense, initialState);
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [description, setDescription] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [reviewing, setReviewing] = useState(false);
  const handled = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.result && handled.current !== state.result.transactionNo) {
      handled.current = state.result.transactionNo;
      setCategory("");
      setAmount("");
      setPaymentMethod("cash");
      setDescription("");
      setKey(crypto.randomUUID());
      setReviewing(false);
    }
  }, [state.result]);

  const canReview = category && amount && /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0;

  let previewAmount = 0n;
  try { if (amount) previewAmount = rupeesToPaisa(amount); } catch {}

  const payload = JSON.stringify({
    businessDate: date,
    category,
    amount,
    paymentMethod,
    description: description.trim() || undefined,
    idempotencyKey: key,
  });

  return (
    <form action={action} className="card">
      <input type="hidden" name="payload" value={payload} />

      {state.error ? <div className="form-error" role="alert">{state.error}</div> : null}
      {state.result ? (
        <div className="form-success">
          <b>Expense {state.result.transactionNo}</b>
          <span>{formatPKR(BigInt(state.result.amountPaisa))}</span>
        </div>
      ) : null}

      <div className="formgrid">
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Select category</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replaceAll("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Amount (PKR)</label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="field">
          <label>Payment method</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            {EXPENSE_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="field form-full">
          <label>Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was this expense for?"
            maxLength={500}
          />
        </div>
      </div>

      <div className="toolbar form-footer">
        <button
          type="button"
          className="button"
          disabled={!canReview}
          onClick={() => setReviewing(true)}
        >
          Review & post
        </button>
      </div>

      {reviewing ? (
        <div className="review-dialog" role="dialog" aria-modal="true">
          <div className="card review-card">
            <div className="section-title">Review expense</div>
            <div className="review-line"><span>Date</span><b>{date}</b></div>
            <div className="review-line"><span>Category</span><b>{category.replaceAll("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</b></div>
            <div className="review-line"><span>Amount</span><b>{formatPKR(previewAmount)}</b></div>
            <div className="review-line"><span>Payment method</span><b>{paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}</b></div>
            {description ? <div className="review-line"><span>Description</span><b>{description}</b></div> : null}
            <div className="toolbar form-footer">
              <button type="button" className="button secondary" onClick={() => setReviewing(false)}>Go back</button>
              <button className="button" disabled={pending}>{pending ? "Posting…" : "Confirm and post"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
