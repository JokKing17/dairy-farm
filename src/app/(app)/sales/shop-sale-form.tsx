"use client";
/* eslint-disable @next/next/no-html-link-for-pages */
import { useActionState, useMemo, useState } from "react";
import {
  formatMilli,
  formatPKR,
  multiplyQuantityRate,
  quantityToMilli,
} from "@/lib/money";
import { formatEggStock,normalizeEggQuantity } from "@/lib/egg-units";
import {
  createShopSale,
  reverseSale,
  type ActionState,
  type ShopSaleState,
} from "./actions";
type Product = {
  sku: string;
  name: string;
  unit: string;
  ratePaisa: string;
  stockMilli: string;
  piecesPerTray?:number;
  pieceRatePaisa?:string;
  trayRatePaisa?:string;
  defaultSaleUnit?:"piece"|"tray";
};
type Customer = { id: string; name: string; code: string };
type Line = {
  id: string;
  sku: string;
  quantity: string;
  yogurtFormat: "loose" | "3" | "3.5" | "custom";
  customKundaSize: string;
  saleUnit:"piece"|"tray";
};
export function ShopSaleForm({
  today,
  products,
  customers,
}: {
  today: string;
  products: Product[];
  customers: Customer[];
}) {
  const [state, action, pending] = useActionState(
      createShopSale,
      {} as ShopSaleState,
    ),
    [open, setOpen] = useState(false),
    [review, setReview] = useState(false),
    [paymentType, setPaymentType] = useState<"cash" | "credit">("cash"),
    [paymentMethod, setPaymentMethod] = useState("cash"),
    [customerId, setCustomerId] = useState(""),
    [date, setDate] = useState(today),
    [notes, setNotes] = useState(""),
    [key] = useState(() => crypto.randomUUID()),
    [lines, setLines] = useState<Line[]>([
      {
        id: crypto.randomUUID(),
        sku: "",
        quantity: "",
        yogurtFormat: "loose",
        customKundaSize: "",
        saleUnit:"piece",
      },
    ]);
  const bySku = useMemo(
      () => new Map(products.map((product) => [product.sku, product])),
      [products],
    ),
    lineQuantity = (line: Line) => {
      const entered = quantityToMilli(line.quantity || "0");
      if(line.sku==="EGG-001"){const product=bySku.get(line.sku);return normalizeEggQuantity(line.quantity,line.saleUnit,product?.piecesPerTray??30).normalizedQuantityMilli}
      if (line.sku !== "YOG-001" || line.yogurtFormat === "loose")
        return entered;
      const count = entered / 1000n,
        size =
          line.yogurtFormat === "custom"
            ? quantityToMilli(line.customKundaSize)
            : quantityToMilli(line.yogurtFormat);
      return count * size;
    };
  const total = useMemo(() => {
    try {
      return lines.reduce((sum, line) => {
        const product = bySku.get(line.sku);
        if(!product)return sum;
        if(line.sku==="EGG-001"){const entered=quantityToMilli(line.quantity||"0")/1000n,rate=BigInt(line.saleUnit==="tray"?product.trayRatePaisa??"0":product.pieceRatePaisa??"0");return sum+entered*rate}
        return sum+multiplyQuantityRate(lineQuantity(line),BigInt(product.ratePaisa));
      }, 0n);
    } catch {
      return 0n;
    }
  }, [lines, bySku]);
  const update = (id: string, change: Partial<Line>) =>
      setLines((current) =>
        current.map((line) => (line.id === id ? { ...line, ...change } : line)),
      ),
    payload = JSON.stringify({
      businessDate: date,
      idempotencyKey: key,
      paymentType,
      paymentMethod: paymentType === "cash" ? paymentMethod : undefined,
      customerId: customerId || undefined,
      notes,
      lines: lines
        .filter((line) => line.sku && line.quantity)
        .map(({ sku, quantity, yogurtFormat, customKundaSize,saleUnit }) => ({
          sku,
          quantity,
          yogurtFormat,
          customKundaSize,
          saleUnit:sku==="EGG-001"?saleUnit:undefined,
        })),
    });
  return (
    <>
      <button
        className="button production-primary"
        onClick={() => setOpen(true)}
      >
        New Shop Sale
      </button>
      {open ? (
        <div className="review-dialog">
          <form action={action} className="card production-form">
            <input type="hidden" name="payload" value={payload} />
            <div className="customer-heading">
              <div>
                <div className="section-title">New Shop Sale</div>
                <div className="subtitle">
                  Cash/Paid Now or Credit/Udhaar is selected for this sale.
                </div>
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
            {state.error ? (
              <div className="form-error">{state.error}</div>
            ) : null}
            {state.result ? (
              <div className="form-success">
                <b>Sale {state.result.transactionNo} posted</b>
                <span>Total {formatPKR(BigInt(state.result.totalPaisa))}</span>
              </div>
            ) : null}
            <div className="formgrid">
              <div className="field">
                <label>Payment type</label>
                <select
                  value={paymentType}
                  onChange={(event) =>
                    setPaymentType(event.target.value as typeof paymentType)
                  }
                >
                  <option value="cash">Cash / Paid Now</option>
                  <option value="credit">Credit / Udhaar</option>
                </select>
              </div>
              <div className="field">
                <label>Business date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              {paymentType === "cash" ? (
                <div className="field">
                  <label>Received in</label>
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                  >
                    <option value="cash">Cash</option>
                    <option value="easypaisa">Easypaisa</option>
                    <option value="jazzcash">JazzCash</option>
                    <option value="bank">Bank</option>
                  </select>
                </div>
              ) : null}
              <div className="field">
                <label>
                  {paymentType === "credit"
                    ? "Shop Customer (required)"
                    : "Shop Customer (optional)"}
                </label>
                <select
                  value={customerId}
                  required={paymentType === "credit"}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  <option value="">
                    {paymentType === "credit"
                      ? "Select Shop Customer"
                      : "Anonymous walk-in"}
                  </option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.code} · {customer.name}
                    </option>
                  ))}
                </select>
                {paymentType === "credit" ? (
                  <a href="/customers?type=shop" className="subtitle">
                    Create Shop Customer
                  </a>
                ) : null}
              </div>
            </div>
            <div className="section-title production-section">Add Products</div>
            {lines.map((line) => {
              const product = bySku.get(line.sku);
              return (
                <div className="kunda-row" key={line.id}>
                  <select
                    value={line.sku}
                    onChange={(event) =>
                      update(line.id, {
                        sku: event.target.value,
                        yogurtFormat: "loose",
                        saleUnit:event.target.value==="EGG-001"?(products.find(item=>item.sku==="EGG-001")?.defaultSaleUnit??"piece"):"piece",
                      })
                    }
                  >
                    <option value="">Select product</option>
                    {products.map((item) => (
                      <option key={item.sku} value={item.sku}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  {line.sku === "YOG-001" ? (
                    <select
                      value={line.yogurtFormat}
                      onChange={(event) =>
                        update(line.id, {
                          yogurtFormat: event.target
                            .value as Line["yogurtFormat"],
                        })
                      }
                    >
                      <option value="loose">Loose Yogurt (kg)</option>
                      <option value="3">3 kg Kunda</option>
                      <option value="3.5">3.5 kg Kunda</option>
                      <option value="custom">Prepared custom Kunda</option>
                    </select>
                  ) : null}
                  {line.sku==="EGG-001"?<label><span>Sell Eggs by</span><select value={line.saleUnit} onChange={event=>update(line.id,{saleUnit:event.target.value as Line["saleUnit"]})}><option value="piece">Piece</option><option value="tray">Tray</option></select></label>:null}
                  {line.yogurtFormat === "custom" && line.sku === "YOG-001" ? (
                    <input
                      placeholder="Kunda kg"
                      inputMode="decimal"
                      value={line.customKundaSize}
                      onChange={(event) =>
                        update(line.id, { customKundaSize: event.target.value })
                      }
                    />
                  ) : null}
                  <input
                    placeholder={
                      line.sku === "YOG-001" && line.yogurtFormat !== "loose"
                        ? "Kunda count"
                        : (product?.unit ?? "Quantity")
                    }
                    inputMode={line.sku==="EGG-001"?"numeric":"decimal"}
                    value={line.quantity}
                    onChange={(event) =>
                      update(line.id, { quantity: event.target.value })
                    }
                  />
                  <span>
                    {product ? (
                      <>
                        <b>{line.sku==="EGG-001"?`${formatPKR(BigInt(line.saleUnit==="tray"?product.trayRatePaisa??"0":product.pieceRatePaisa??"0"))}/${line.saleUnit}`:`${formatPKR(BigInt(product.ratePaisa))}/${product.unit}`}</b>
                        <small>
                          {line.sku==="EGG-001"?`${formatEggStock(BigInt(product.stockMilli),product.piecesPerTray??30).label} · ${formatEggStock(BigInt(product.stockMilli),product.piecesPerTray??30).totalPieces} total eggs`:`${formatMilli(BigInt(product.stockMilli))} available`}
                        </small>
                        {line.sku==="EGG-001"&&line.quantity?(()=>{try{const normalized=normalizeEggQuantity(line.quantity,line.saleUnit,product.piecesPerTray??30),after=BigInt(product.stockMilli)-normalized.normalizedQuantityMilli;return <small>Deduct {normalized.normalizedPieces.toString()} eggs · after sale: {after>=0n?formatEggStock(after,product.piecesPerTray??30).label:"insufficient stock"}</small>}catch{return <small>Enter a whole number</small>}})():null}
                      </>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.id !== line.id),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    sku: "",
                    quantity: "",
                    yogurtFormat: "loose",
                    customKundaSize: "",
                    saleUnit:"piece",
                  },
                ])
              }
            >
              Add product
            </button>
            <div className="field production-section">
              <label>Notes</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
            <div className="delivery-totals">
              <span>
                <small>Sale type</small>
                <b>{paymentType === "cash" ? "Paid Now" : "Credit / Udhaar"}</b>
              </span>
              <span>
                <small>Total</small>
                <b>{formatPKR(total)}</b>
              </span>
              <button
                type="button"
                className="button"
                disabled={
                  pending ||
                  Boolean(state.result) ||
                  !lines.some((line) => line.sku && line.quantity)
                }
                onClick={() => setReview(true)}
              >
                Review &amp; Post
              </button>
            </div>
            {review ? (
              <div className="review-dialog nested">
                <div className="card review-card">
                  <div className="section-title">Confirm Shop Sale</div>
                  <div className="review-line">
                    <span>Payment</span>
                    <b>
                      {paymentType === "cash"
                        ? "Cash / Paid Now"
                        : "Credit / Udhaar"}
                    </b>
                  </div>
                  <div className="review-line">
                    <span>Product lines</span>
                    <b>
                      {lines.filter((line) => line.sku && line.quantity).length}
                    </b>
                  </div>
                  <div className="review-total">
                    <span>Total</span>
                    <b>{formatPKR(total)}</b>
                  </div>
                  <div className="toolbar">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setReview(false)}
                    >
                      Go back
                    </button>
                    <button className="button" disabled={pending}>
                      {pending ? "Posting…" : "Confirm and post"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </form>
        </div>
      ) : null}
    </>
  );
}
export function ShopSaleReversal({ transactionNo }: { transactionNo: string }) {
  const [state, action, pending] = useActionState(
      reverseSale,
      {} as ActionState,
    ),
    [open, setOpen] = useState(false);
  return (
    <>
      {open ? (
        <div className="review-dialog">
          <form action={action} className="card review-card">
            <input type="hidden" name="transactionNo" value={transactionNo} />
            <div className="section-title">Reverse {transactionNo}</div>
            <p>
              Stock, Kunda count, Cash or Udhaar will be compensated together.
            </p>
            <div className="field">
              <label>Reason</label>
              <textarea name="reason" minLength={5} required />
            </div>
            {state.error ? (
              <div className="form-error">{state.error}</div>
            ) : null}
            {state.success ? (
              <div className="form-success">{state.success}</div>
            ) : null}
            <div className="toolbar">
              <button
                type="button"
                className="button secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="button" disabled={pending}>
                {pending ? "Reversing…" : "Confirm reversal"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button
          type="button"
          className="button secondary"
          onClick={() => setOpen(true)}
        >
          Reverse
        </button>
      )}
    </>
  );
}
