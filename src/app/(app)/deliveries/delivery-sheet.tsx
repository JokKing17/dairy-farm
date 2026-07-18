"use client";
import { useActionState, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { formatEggStock } from "@/lib/egg-units";
import { formatMilli, formatPKR, multiplyQuantityRate, quantityToMilli } from "@/lib/money";
import { postDeliveries, type DeliveryState } from "./actions";

type Product = {
  sku: string;
  name: string;
  unit: string;
  ratePaisa: string;
  stockMilli: string;
  stockSource: string;
  piecesPerTray: number;
  defaultSaleUnit: "piece" | "tray";
  pieceSellingRatePaisa: string;
  traySellingRatePaisa: string;
  unavailableReason?: string;
};
type Customer = { id: string; code: string; name: string; address: string; normalQuantity: string; ratePaisa: string; paused: boolean };
type Line = Customer & {
  deliveryStatus: "delivered" | "changed" | "extra" | "skipped" | "paused";
  milkQuantity: string;
  notes: string;
  products: Record<string, string>;
  saleUnits: Record<string, "" | "piece" | "tray">;
};
const wasDelivered = (status: Line["deliveryStatus"]) => status !== "skipped" && status !== "paused";

function getProductQuantityMilli(product: Product, quantity: string, saleUnit: "piece" | "tray" | "") {
  const entered = quantityToMilli(quantity || "0");
  if (entered <= 0n) return 0n;
  if (product.sku !== "EGG-001") return entered;
  if (entered % 1000n !== 0n || !saleUnit) return 0n;
  const count = entered / 1000n;
  const piecesPerTray = BigInt(product.piecesPerTray || 30);
  const normalizedPieces = saleUnit === "tray" ? count * piecesPerTray : count;
  return normalizedPieces * 1000n;
}

function eggPreview(product: Product, quantity: string, saleUnit: "piece" | "tray" | "") {
  const entered = quantityToMilli(quantity || "0");
  if (entered <= 0n || entered % 1000n !== 0n || !saleUnit) return null;
  const count = entered / 1000n;
  const piecesPerTray = BigInt(product.piecesPerTray || 30);
  const normalizedPieces = saleUnit === "tray" ? count * piecesPerTray : count;
  const rate = saleUnit === "tray" ? BigInt(product.traySellingRatePaisa || product.ratePaisa) : BigInt(product.pieceSellingRatePaisa || product.ratePaisa);
  const amount = count * rate;
  const stockPieces = BigInt(product.stockMilli) / 1000n;
  const remainingPieces = stockPieces - normalizedPieces;
  return { count, normalizedPieces, rate, amount, stockPieces, remainingPieces };
}

export function DeliverySheet({ customers, products, today }: { customers: Customer[]; products: Product[]; today: string }) {
  const [state, action, pending] = useActionState(postDeliveries, {} as DeliveryState);
  const [businessDate, setBusinessDate] = useState(today);
  const [key] = useState(() => crypto.randomUUID());
  const [reviewing, setReviewing] = useState(false);
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    customers.map((customer) => ({
      ...customer,
      deliveryStatus: customer.paused ? "paused" : "delivered",
      milkQuantity: customer.normalQuantity,
      notes: "",
      products: Object.fromEntries(products.map((product) => [product.sku, ""])),
      saleUnits: Object.fromEntries(products.map((product) => [product.sku, product.sku === "EGG-001" ? product.defaultSaleUnit : ""])) as Record<string, "" | "piece" | "tray">,
    })),
  );

  const totals = useMemo(
    () =>
      lines.reduce(
        (total, line) => {
          if (!wasDelivered(line.deliveryStatus)) return total;
          let milk = 0n;
          let amount = 0n;
          try {
            milk = quantityToMilli(line.milkQuantity || "0");
            amount = multiplyQuantityRate(milk, BigInt(line.ratePaisa));
            for (const product of products) {
              const value = line.products[product.sku];
              if (!value) continue;
              if (product.sku === "EGG-001") {
                const preview = eggPreview(product, value, line.saleUnits[product.sku]);
                if (preview) amount += preview.amount;
              } else {
                amount += multiplyQuantityRate(quantityToMilli(value), BigInt(product.ratePaisa));
              }
            }
          } catch {
            // ignore preview errors
          }
          return { milk: total.milk + milk, amount: total.amount + amount, delivered: total.delivered + 1, skipped: total.skipped };
        },
        { milk: 0n, amount: 0n, delivered: 0, skipped: lines.filter((line) => !wasDelivered(line.deliveryStatus)).length },
      ),
    [lines, products],
  );

  const productAssigned = useMemo(
    () =>
      new Map(
        products.map((product) => [
          product.sku,
          lines.reduce((sum, line) => {
            if (!wasDelivered(line.deliveryStatus)) return sum;
            try {
              return sum + getProductQuantityMilli(product, line.products[product.sku] || "0", line.saleUnits[product.sku]);
            } catch {
              return sum;
            }
          }, 0n),
        ]),
      ),
    [lines, products],
  );

  const update = (index: number, change: Partial<Line>) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...change } : line)));
  const payload = JSON.stringify({
    businessDate,
    idempotencyKey: key,
    lines: lines.map((line) => ({
      customerId: line.id,
      deliveryStatus: line.deliveryStatus,
      milkQuantity: line.milkQuantity,
      notes: line.notes,
      products: products.map((product) => ({
        sku: product.sku,
        quantity: line.products[product.sku] || "",
        saleUnit: product.sku === "EGG-001" ? line.saleUnits[product.sku] || undefined : undefined,
      })),
    })),
  });

  return (
    <form action={action} className="card table-card delivery-sheet">
      <input type="hidden" name="payload" value={payload} />
      <div className="delivery-heading">
        <div className="field">
          <label>Delivery date</label>
          <input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
        </div>
        <div>
          <b>{customers.length} household customers</b>
          <div className="subtitle">Normal quantities are already filled. Change exceptions only.</div>
        </div>
      </div>
      {state.error ? <div className="form-error" role="alert">{state.error}</div> : null}
      {state.result ? (
        <div className="form-success delivery-receipt">
          <b>Posted {state.result.transactionNo}</b>
          <span>
            {state.result.deliveredCustomers} delivered · {state.result.skippedCustomers} skipped · {formatMilli(BigInt(state.result.totalMilkMilli))} L · {formatPKR(BigInt(state.result.totalAmountPaisa))}
          </span>
          <button type="button" className="button secondary" onClick={() => window.print()}>
            Print receipt
          </button>
        </div>
      ) : null}
      <div className="list-search-row">
        <label className="search-field delivery-search">
          <span className="sr-only">Search household customers</span>
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
            placeholder="Search household customer or address"
          />
          {search ? <button type="button" className="search-clear" onClick={() => setSearch("")} aria-label="Clear customer search"><X size={16}/></button> : null}
        </label>
        <span className="result-count">{lines.filter(line => `${line.name} ${line.address}`.toLowerCase().includes(search.toLowerCase())).length} of {lines.length} customers visible</span>
      </div>
      <div className="delivery-stock-strip">
        {products.map((product) => {
          const remaining = BigInt(product.stockMilli) - (productAssigned.get(product.sku) ?? 0n);
          return (
            <span key={product.sku}>
              <small>{product.name} remaining</small>
              <b>
                {product.sku === "EGG-001"
                  ? `${formatEggStock(BigInt(product.stockMilli), product.piecesPerTray).label} · ${BigInt(product.stockMilli) / 1000n} total eggs`
                  : `${formatMilli(remaining)} ${product.unit}`}
              </b>
              {product.unavailableReason ? <em>{product.unavailableReason}</em> : null}
            </span>
          );
        })}
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>House</th>
              <th>Today</th>
              <th>Milk (L)</th>
              <th>Other products</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => `${line.name} ${line.address}`.toLowerCase().includes(search.toLowerCase()) ? (
              <tr key={line.id}>
                <td>
                  <b>{line.name}</b>
                  <div className="subtitle">
                    {line.code} · {line.address}
                  </div>
                </td>
                <td>
                  <select value={line.deliveryStatus} onChange={(event) => update(index, { deliveryStatus: event.target.value as Line["deliveryStatus"] })}>
                    <option value="delivered">Delivered normally</option>
                    <option value="changed">Changed quantity</option>
                    <option value="extra">Extra milk</option>
                    <option value="skipped">Skipped today</option>
                    <option value="paused">Customer paused</option>
                  </select>
                </td>
                <td>
                  <input inputMode="decimal" value={line.milkQuantity} disabled={!wasDelivered(line.deliveryStatus)} onChange={(event) => update(index, { milkQuantity: event.target.value })} />
                  {wasDelivered(line.deliveryStatus) && line.milkQuantity !== line.normalQuantity ? <small className="changed-value">Normal: {line.normalQuantity} L</small> : null}
                </td>
                <td>
                  <details>
                    <summary>Add products</summary>
                    <div className="extra-products">
                      {products.map((product) => {
                        const saleUnit = line.saleUnits[product.sku];
                        const preview = product.sku === "EGG-001" ? eggPreview(product, line.products[product.sku], saleUnit) : null;
                        return (
                          <label key={product.sku}>
                            {product.name}
                            {product.sku === "EGG-001" ? (
                              <select value={saleUnit} disabled={!wasDelivered(line.deliveryStatus) || Boolean(product.unavailableReason)} onChange={(event) => update(index, { saleUnits: { ...line.saleUnits, [product.sku]: event.target.value as Line["saleUnits"][string] } })}>
                                <option value="piece">Piece</option>
                                <option value="tray">Tray</option>
                              </select>
                            ) : null}
                            <input
                              inputMode="decimal"
                              placeholder={product.sku === "EGG-001" ? (saleUnit === "tray" ? "trays" : "pieces") : product.unit}
                              value={line.products[product.sku]}
                              disabled={!wasDelivered(line.deliveryStatus) || Boolean(product.unavailableReason)}
                              onChange={(event) => update(index, { products: { ...line.products, [product.sku]: event.target.value } })}
                            />
                            {product.sku === "EGG-001" ? (
                              <small className="product-unavailable">
                                {preview
                                  ? `Deducts ${preview.normalizedPieces} eggs · Remaining ${preview.remainingPieces} eggs · Line total ${formatPKR(preview.amount)}`
                                  : product.unavailableReason ?? `Current stock: ${formatEggStock(BigInt(product.stockMilli), product.piecesPerTray).label} · ${BigInt(product.stockMilli) / 1000n} total eggs`}
                              </small>
                            ) : product.unavailableReason ? (
                              <small className="product-unavailable">{product.unavailableReason}</small>
                            ) : (
                              <small>{formatMilli(BigInt(product.stockMilli) - (productAssigned.get(product.sku) ?? 0n))} {product.unit} remaining</small>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </details>
                </td>
                <td>
                  <input value={line.notes} onChange={(event) => update(index, { notes: event.target.value })} />
                </td>
              </tr>
            ) : null)}
          </tbody>
        </table>
      </div>
      <div className="delivery-totals">
        <span>
          <small>Customers</small>
          <b>{totals.delivered} delivered · {totals.skipped} skipped</b>
        </span>
        <span>
          <small>Total milk</small>
          <b>{formatMilli(totals.milk)} L</b>
        </span>
        <span>
          <small>Total value</small>
          <b>{formatPKR(totals.amount)}</b>
        </span>
        <button type="button" className="button" disabled={pending || Boolean(state.result) || !customers.length} onClick={() => setReviewing(true)}>
          Review &amp; Post
        </button>
      </div>
      {reviewing ? (
        <div className="review-dialog" role="dialog" aria-modal="true">
          <div className="card review-card">
            <div className="section-title">Review daily deliveries</div>
            <p>{businessDate}</p>
            <div className="review-line">
              <span>Delivered customers</span>
              <b>{totals.delivered}</b>
            </div>
            <div className="review-line">
              <span>Skipped or paused</span>
              <b>{totals.skipped}</b>
            </div>
            <div className="review-line">
              <span>Milk going out</span>
              <b>{formatMilli(totals.milk)} L</b>
            </div>
            <div className="review-total">
              <span>Customer charges</span>
              <b>{formatPKR(totals.amount)}</b>
            </div>
            <div className="toolbar">
              <button type="button" className="button secondary" onClick={() => setReviewing(false)}>
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
  );
}
