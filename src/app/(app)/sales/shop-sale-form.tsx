"use client";
/* eslint-disable @next/next/no-html-link-for-pages */
import { useActionState, useMemo, useState, useCallback } from "react";
import {
  formatMilli,
  formatPKR,
  multiplyQuantityRate,
  quantityToMilli,
} from "@/lib/money";
import { formatEggStock } from "@/lib/egg-units";
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
  pieceSellingRatePaisa?: string;
  traySellingRatePaisa?: string;
  piecesPerTray?: number;
  defaultSaleUnit?: "piece" | "tray";
};
type Customer = { id: string; name: string; code: string };
type Line = {
  id: string;
  sku: string;
  quantity: string;
  saleUnit: "piece" | "tray" | "";
  yogurtFormat: "loose" | "3" | "3.5" | "custom";
  customKundaSize: string;
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
        saleUnit: "",
        yogurtFormat: "loose",
        customKundaSize: "",
      },
    ]);
  // Next.js compiler may skip preserving manual memoization; keep stable bySku here
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const bySku = useMemo(() => new Map(products.map((product) => [product.sku, product])), [products]),
    lineQuantity = (line: Line) => {
      const entered = quantityToMilli(line.quantity || "0");
      if (line.sku !== "YOG-001" || line.yogurtFormat === "loose")
        return entered;
      const count = entered / 1000n,
        size =
          line.yogurtFormat === "custom"
            ? quantityToMilli(line.customKundaSize)
            : quantityToMilli(line.yogurtFormat);
      return count * size;
    },
    eggLinePreview = useCallback((line: Line) => {
      const product = bySku.get(line.sku);
      if (!product || line.sku !== "EGG-001" || !line.saleUnit) return null;
      try {
        const entered = quantityToMilli(line.quantity || "0");
        if (entered <= 0n || entered % 1000n !== 0n) return null;
        const count = entered / 1000n,
          piecesPerTray = BigInt(product.piecesPerTray ?? 30),
          pieceRate = BigInt(product.pieceSellingRatePaisa ?? product.ratePaisa),
          trayRate = BigInt(product.traySellingRatePaisa ?? 0),
          rate = line.saleUnit === "tray" ? trayRate : pieceRate,
          normalizedPieces =
            line.saleUnit === "tray" ? count * piecesPerTray : count,
          stockPieces = BigInt(product.stockMilli) / 1000n,
          remainingPieces = stockPieces - normalizedPieces,
          amount = count * rate;
        return {
          piecesPerTray,
          normalizedPieces,
          remainingPieces,
          amount,
          rate,
          stockPieces,
        };
      } catch {
        return null;
      }
    }, [bySku]);
  const total = useMemo(() => {
    try {
      return lines.reduce((sum, line) => {
        const product = bySku.get(line.sku);
        if (!product) return sum;
        if (line.sku === "EGG-001" && line.saleUnit) {
          const preview = eggLinePreview(line);
          return preview ? sum + preview.amount : sum;
        }
        return sum + multiplyQuantityRate(lineQuantity(line), BigInt(product.ratePaisa));
      }, 0n);
    } catch {
      return 0n;
    }
  }, [lines, bySku, eggLinePreview]);
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
        .map(({ sku, quantity, saleUnit, yogurtFormat, customKundaSize }) => ({
          sku,
          quantity,
          saleUnit: sku === "EGG-001" ? saleUnit || undefined : undefined,
          yogurtFormat,
          customKundaSize,
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
        <div className="review-dialog" role="dialog" aria-modal="true" aria-label="Review Shop Sale">
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
                        saleUnit:
                          event.target.value === "EGG-001"
                            ? (bySku.get("EGG-001")?.defaultSaleUnit ?? "piece")
                            : "",
                        yogurtFormat: "loose",
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
                  {line.sku === "EGG-001" ? (
                    <select
                      value={line.saleUnit || (bySku.get("EGG-001")?.defaultSaleUnit ?? "piece")}
                      onChange={(event) =>
                        update(line.id, {
                          saleUnit: event.target.value as Line["saleUnit"],
                        })
                      }
                    >
                      <option value="piece">Sell Eggs by piece</option>
                      <option value="tray">Sell Eggs by tray</option>
                    </select>
                  ) : null}
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
                      line.sku === "EGG-001"
                        ? line.saleUnit === "tray"
                          ? "Number of trays"
                          : "Number of eggs"
                        : line.sku === "YOG-001" && line.yogurtFormat !== "loose"
                        ? "Kunda count"
                        : (product?.unit ?? "Quantity")
                    }
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) =>
                      update(line.id, { quantity: event.target.value })
                    }
                  />
                  <span>
                    {product ? (
                      <>
                        <b>
                          {line.sku === "EGG-001" && line.saleUnit === "tray"
                            ? formatPKR(BigInt(product.traySellingRatePaisa ?? product.ratePaisa)) + "/tray"
                            : line.sku === "EGG-001"
                              ? formatPKR(BigInt(product.pieceSellingRatePaisa ?? product.ratePaisa)) + "/piece"
                              : `${formatPKR(BigInt(product.ratePaisa))}/${product.unit}`}
                        </b>
                        <small>
                          {line.sku === "EGG-001"
                            ? (() => {
                                const stock = formatEggStock(BigInt(product.stockMilli), product.piecesPerTray ?? 30);
                                return `${stock.label} · ${stock.totalPieces} total eggs`;
                              })()
                            : `${formatMilli(BigInt(product.stockMilli))} available`}
                        </small>
                        {line.sku === "EGG-001" && line.saleUnit ? (
                          <small>
                            {(() => {
                              const preview = eggLinePreview(line);
                              return preview
                                ? `Deducts ${preview.normalizedPieces} eggs · Remaining ${preview.remainingPieces} eggs · Line total ${formatPKR(preview.amount)}`
                                : "Enter a whole number of eggs or trays.";
                            })()}
                          </small>
                        ) : null}
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
                    saleUnit: "",
                    yogurtFormat: "loose",
                    customKundaSize: "",
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
              <div className="review-dialog nested" role="dialog" aria-modal="true" aria-label="Confirm sale reversal">
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
        <div className="review-dialog" role="dialog" aria-modal="true" aria-label="Shop Sale receipt">
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
