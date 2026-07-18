"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { formatEggStock, eggPurchaseCalculation, normalizeEggQuantity, validatePiecesPerTray } from "@/lib/egg-units";
import { formatMilli, formatPKR, integerToBigInt, multiplyQuantityRate, quantityToMilli, rupeesToPaisa } from "@/lib/money";
import { addInventory, reverseReceipt, type InventoryState, type ReversalState } from "./actions";

type Product = {
  sku: string;
  name: string;
  unit: string;
  stockMilli: string;
  averageCostPaisa: string;
  retailRatePaisa: string;
  pieceSellingRatePaisa?: string;
  traySellingRatePaisa?: string;
  piecesPerTray?: number;
  defaultSaleUnit?: "piece" | "tray";
};

export function AddInventoryForm({ products, today }: { products: Product[]; today: string }) {
  const [state, action, pending] = useActionState(addInventory, {} as InventoryState);
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const handled = useRef<string | undefined>(undefined);
  const [businessDate, setDate] = useState(today);
  const [sku, setSku] = useState(products[0]?.sku ?? "");
  const [quantity, setQuantity] = useState("");
  const [buyingPrice, setBuyingPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [pieceSellingPrice, setPieceSellingPrice] = useState("");
  const [traySellingPrice, setTraySellingPrice] = useState("");
  const [receivingUnit, setReceivingUnit] = useState<"piece" | "tray">("tray");
  const [keepRate, setKeepRate] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "partial" | "unpaid">("paid");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [notes, setNotes] = useState("");

  const product = products.find((item) => item.sku === sku) ?? products[0];
  const eggEnabled = product?.sku === "EGG-001";

  const calculation = useMemo(() => {
    try {
      if (eggEnabled) {
        const piecesPerTray = validatePiecesPerTray(product?.piecesPerTray ?? 30);
        const normalized = normalizeEggQuantity(quantity || "0", receivingUnit, piecesPerTray);
        const buying = rupeesToPaisa(buyingPrice);
        const pieceRate = rupeesToPaisa(pieceSellingPrice || String((product?.pieceSellingRatePaisa ?? product?.retailRatePaisa) || "0"));
        const trayRate = rupeesToPaisa(traySellingPrice || String(product?.traySellingRatePaisa ?? "0"));
        const existingStockMilli = BigInt(product?.stockMilli ?? 0);
        const existingAverageCostPerPiecePaisa = BigInt(product?.averageCostPaisa ?? 0);
        const result = eggPurchaseCalculation({
          enteredQuantity: normalized.enteredQuantity,
          enteredUnit: normalized.enteredUnit,
          buyingPricePerEnteredUnitPaisa: buying,
          piecesPerTray,
          existingStockMilli,
          existingAverageCostPerPiecePaisa,
        });
        const currentPieces = existingStockMilli / 1000n;
        return {
          egg: true,
          piecesPerTray,
          receivedPieces: result.normalizedPieces,
          receivedMilli: result.normalizedQuantityMilli,
          purchaseTotal: result.purchaseTotalPaisa,
          purchaseCostPerPiece: result.purchaseCostPerPiecePaisa,
          existingPieces: currentPieces,
          newPieces: currentPieces + result.normalizedPieces,
          newStockMilli: result.resultingStockMilli,
          newAverageCost: result.resultingAverageCostPerPiecePaisa,
          pieceRate,
          trayRate,
          normalized,
        };
      }
      const received = quantityToMilli(quantity),
        buy = rupeesToPaisa(buyingPrice),
        oldStock = BigInt(product?.stockMilli ?? 0),
        oldCost = BigInt(product?.averageCostPaisa ?? 0),
        newStock = oldStock + received,
        newAverage = newStock > 0n ? (oldStock * oldCost + received * buy) / newStock : 0n;
      return { received, total: multiplyQuantityRate(received, buy), oldStock, oldCost, newStock, newAverage };
    } catch {
      return null;
    }
  }, [quantity, buyingPrice, product, eggEnabled, receivingUnit, pieceSellingPrice, traySellingPrice]);
  const eggCalculation = eggEnabled && calculation && "egg" in calculation ? calculation as {
    egg: true;
    piecesPerTray: number;
    receivedPieces: bigint;
    receivedMilli: bigint;
    purchaseTotal: bigint;
    purchaseCostPerPiece: bigint;
    existingPieces: bigint;
    newPieces: bigint;
    newStockMilli: bigint;
    newAverageCost: bigint;
    pieceRate: bigint;
    trayRate: bigint;
    normalized: { enteredQuantity: bigint; enteredUnit: "piece" | "tray"; normalizedPieces: bigint; normalizedQuantityMilli: bigint; piecesPerTraySnapshot: number };
  } : null;

  useEffect(() => {
    if (state.result && handled.current !== state.result.transactionNo) {
      handled.current = state.result.transactionNo;
      setKey(crypto.randomUUID());
      setReview(false);
      setQuantity("");
      setBuyingPrice("");
      setSellingPrice("");
      setPieceSellingPrice("");
      setTraySellingPrice("");
      setPaidAmount("");
    }
  }, [state.result]);

  const payload = JSON.stringify({
    businessDate,
    idempotencyKey: key,
    supplierName,
    supplierReference,
    paymentStatus,
    paymentMethod: paymentStatus === "unpaid" ? undefined : paymentMethod,
    paidAmount: paymentStatus === "partial" ? paidAmount : undefined,
    notes,
    lines: [
      eggEnabled
        ? {
            productSku: sku,
            quantity,
            buyingPrice,
            receivingUnit,
            keepExistingSellingPrice: keepRate,
            pieceSellingPrice: keepRate ? undefined : pieceSellingPrice,
            traySellingPrice: keepRate ? undefined : traySellingPrice,
          }
        : {
            productSku: sku,
            quantity,
            buyingPrice,
            sellingPrice: keepRate ? undefined : sellingPrice,
            keepExistingSellingPrice: keepRate,
          },
    ],
  });

  return (
    <>
      <button className="button inventory-primary" type="button" onClick={() => setOpen(true)}>
        Add Inventory
      </button>
      {open ? (
        <div className="review-dialog" role="dialog" aria-modal="true" aria-label="Review inventory receipt">
          <form action={action} className="card inventory-form">
            <input type="hidden" name="payload" value={payload} />
            <div className="customer-heading">
              <div>
                <div className="section-title">Add Inventory</div>
                <div className="subtitle">Receive Bread, Eggs or Ispaghol.</div>
              </div>
              <button type="button" className="button secondary" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            {state.error ? <div className="form-error" role="alert">{state.error}</div> : null}
            {state.result ? (
              <div className="form-success">
                <b>Saved {state.result.transactionNo}</b>
                <span>Purchase total {formatPKR(BigInt(state.result.subtotalPaisa))}</span>
              </div>
            ) : null}
            <div className="formgrid">
              <div className="field">
                <label>Business date</label>
                <input type="date" value={businessDate} onChange={(event) => setDate(event.target.value)} />
              </div>
              <div className="field">
                <label>Product</label>
                <select
                  value={sku}
                  onChange={(event) => {
                    const nextSku = event.target.value;
                    const nextProduct = products.find((item) => item.sku === nextSku);
                    setSku(nextSku);
                    setKeepRate(false);
                    setSellingPrice("");
                    setPieceSellingPrice("");
                    setTraySellingPrice("");
                    setReceivingUnit(nextSku === "EGG-001" ? (nextProduct?.defaultSaleUnit ?? "tray") : "tray");
                  }}
                >
                  {products.map((item) => (
                    <option value={item.sku} key={item.sku}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              {eggEnabled ? (
                <div className="field">
                  <label>Receiving unit</label>
                  <select value={receivingUnit} onChange={(event) => setReceivingUnit(event.target.value as "piece" | "tray")}>
                    <option value="tray">Tray</option>
                    <option value="piece">Piece</option>
                  </select>
                </div>
              ) : null}

              <div className="field">
                <label>
                  {eggEnabled
                    ? receivingUnit === "tray"
                      ? "Number of trays received"
                      : "Number of eggs received"
                    : `Quantity received (${product?.unit})`}
                </label>
                <input value={quantity} inputMode="decimal" onChange={(event) => setQuantity(event.target.value)} autoFocus />
              </div>

              <div className="field">
                <label>
                  {eggEnabled
                    ? receivingUnit === "tray"
                      ? "Buying price per tray"
                      : "Buying price per egg"
                    : `Buying price per ${product?.unit}`}
                </label>
                <input value={buyingPrice} inputMode="decimal" onChange={(event) => setBuyingPrice(event.target.value)} />
              </div>

              {eggEnabled ? (
                <>
                  <div className="field">
                    <label htmlFor="eggPieceSellingPrice">Selling price per egg</label>
                    <input id="eggPieceSellingPrice" value={pieceSellingPrice} inputMode="decimal" disabled={keepRate} onChange={(event) => setPieceSellingPrice(event.target.value)} placeholder={formatPKR(BigInt(product?.pieceSellingRatePaisa ?? product?.retailRatePaisa ?? 0)).replace("PKR ", "")} />
                  </div>
                  <div className="field">
                    <label htmlFor="eggTraySellingPrice">Selling price per tray</label>
                    <input id="eggTraySellingPrice" value={traySellingPrice} inputMode="decimal" disabled={keepRate} onChange={(event) => setTraySellingPrice(event.target.value)} placeholder={formatPKR(BigInt(product?.traySellingRatePaisa ?? 0)).replace("PKR ", "")} />
                  </div>
                  <div className="field">
                    <label>Egg stock preview</label>
                    <div className="subtitle">
                      {calculation && "egg" in calculation && calculation.egg ? (
                        <>
                          Current stock: {formatEggStock(BigInt(product?.stockMilli ?? 0), calculation.piecesPerTray).label} · {calculation.existingPieces} total eggs
                          <br />
                          New stock: {formatEggStock(calculation.newStockMilli, calculation.piecesPerTray).label} · {calculation.newPieces} total eggs
                          <br />
                          Deducted pieces: {calculation.receivedPieces}
                        </>
                      ) : (
                        "Enter a whole number of eggs or trays."
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="field">
                  <label>Selling price per {product?.unit}</label>
                  <input value={sellingPrice} inputMode="decimal" disabled={keepRate} onChange={(event) => setSellingPrice(event.target.value)} placeholder={formatPKR(BigInt(product?.retailRatePaisa ?? 0)).replace("PKR ", "")} />
                </div>
              )}

              <div className="field">
                <label>Supplier name</label>
                <input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} />
              </div>
              <div className="field">
                <label>Supplier reference</label>
                <input value={supplierReference} onChange={(event) => setSupplierReference(event.target.value)} />
              </div>
              <div className="field">
                <label>Notes</label>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>
            </div>
            <div className="delivery-totals">
              <span>
                <small>Current stock</small>
                <b>
                  {eggCalculation
                    ? `${formatEggStock(BigInt(product?.stockMilli ?? 0), eggCalculation.piecesPerTray).label} · ${eggCalculation.existingPieces} total eggs`
                    : `${formatMilli(integerToBigInt(product?.stockMilli ?? 0))} ${product?.unit}`}
                </b>
              </span>
              <span>
                <small>New stock</small>
                <b>
                  {eggCalculation
                    ? `${formatEggStock(eggCalculation.newStockMilli, eggCalculation.piecesPerTray).label} · ${eggCalculation.newPieces} total eggs`
                    : calculation
                      ? formatMilli((calculation as { newStock: bigint }).newStock)
                      : "—"}
                </b>
              </span>
              <span>
                <small>Purchase total</small>
                <b>{calculation ? formatPKR(eggCalculation ? eggCalculation.purchaseTotal : (calculation as { total: bigint }).total) : "PKR 0.00"}</b>
              </span>
              <button type="button" className="button" disabled={pending || Boolean(state.result) || !sku || !quantity} onClick={() => setReview(true)}>
                Review &amp; Post
              </button>
            </div>
            {review ? (
              <div className="review-dialog nested" role="dialog" aria-modal="true" aria-label="Confirm inventory reversal">
                <div className="card review-card">
                  <div className="section-title">Confirm Inventory Receipt</div>
                  <div className="review-line">
                    <span>Product</span>
                    <b>{product?.name}</b>
                  </div>
                  <div className="review-line">
                    <span>Quantity</span>
                    <b>{eggEnabled ? `${quantity} ${receivingUnit}${quantity === "1" ? "" : "s"}` : quantity}</b>
                  </div>
                  <div className="review-line">
                    <span>Total</span>
                    <b>{formatPKR(calculation ? eggCalculation ? eggCalculation.purchaseTotal : (calculation as { total: bigint }).total : 0n)}</b>
                  </div>
                  <div className="toolbar">
                    <button type="button" className="button secondary" onClick={() => setReview(false)}>
                      Go back
                    </button>
                    <button className="button" disabled={pending}>
                      {pending ? "Posting…" : "Confirm and post"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="field">
              <label>Payment status</label>
              <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as typeof paymentStatus)}>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>
            {paymentStatus !== "unpaid" ? (
              <div className="field">
                <label>Payment method</label>
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="jazzcash">JazzCash</option>
                </select>
              </div>
            ) : null}
            {paymentStatus === "partial" ? (
              <div className="field">
                <label>Paid amount</label>
                <input value={paidAmount} inputMode="decimal" onChange={(event) => setPaidAmount(event.target.value)} />
              </div>
            ) : null}
            <div className="toolbar">
              <label className="inline-check">
                <input type="checkbox" checked={keepRate} onChange={(event) => setKeepRate(event.target.checked)} /> Keep existing selling price
              </label>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

export function ReceiptReversal({ transactionNo, status }: { transactionNo: string; status: string }) {
  const [state, action, pending] = useActionState(reverseReceipt, {} as ReversalState);
  const [open, setOpen] = useState(false);

  if (status !== "posted") {
    return (
      <>
        <button className="button secondary" type="button" onClick={() => window.print()}>
          Print
        </button>
        <span className="badge">Reversed</span>
      </>
    );
  }

  return (
    <>
      <button className="button secondary" type="button" onClick={() => window.print()}>
        Print
      </button>
      <button className="button secondary" type="button" onClick={() => setOpen(true)}>
        Reverse
      </button>
      {open ? (
        <div className="review-dialog" role="dialog" aria-modal="true" aria-label="Inventory receipt details">
          <form action={action} className="card review-card">
            <input type="hidden" name="transactionNo" value={transactionNo} />
            <div className="section-title">Reverse {transactionNo}</div>
            <p className="subtitle">Only safe when none of this received stock has been used or changed.</p>
            {state.error ? <div className="form-error">{state.error}</div> : null}
            {state.success ? <div className="form-success">{state.success}</div> : null}
            <div className="field">
              <label>Reason</label>
              <textarea name="reason" required minLength={5} />
            </div>
            <div className="toolbar">
              <button type="button" className="button secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="button" disabled={pending}>
                {pending ? "Reversing…" : "Confirm reversal"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
