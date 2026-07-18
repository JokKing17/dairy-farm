import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatEggStock } from "@/lib/egg-units";
import { MANUAL_RECEIPT_SKUS } from "@/lib/inventory-calculations";
import { formatMilli, formatPKR, integerToBigInt, multiplyQuantityRate } from "@/lib/money";
import { karachiBusinessDate } from "@/lib/queries";
import { AddInventoryForm, ReceiptReversal } from "./inventory-form";

export const dynamic = "force-dynamic";

const visibleSkus = ["MILK-001", ...MANUAL_RECEIPT_SKUS];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; product?: string; supplier?: string }>;
}) {
  await requireSession();
  const filters = await searchParams;
  const database = await db();
  const receiptMatch: Record<string, unknown> = {};

  if (filters.date) receiptMatch.businessDate = filters.date;
  if (filters.supplier) receiptMatch.supplierName = { $regex: filters.supplier, $options: "i" };
  if (filters.product) receiptMatch["lines.productSku"] = filters.product;

  const [products, receipts] = await Promise.all([
    database.collection("products").find({ sku: { $in: visibleSkus }, internalOnly: { $ne: true } }).sort({ name: 1 }).toArray(),
    database.collection("inventory_receipts").find(receiptMatch).sort({ businessDate: -1, createdAt: -1 }).limit(100).toArray(),
  ]);

  const bySku = new Map(products.map((product) => [String(product.sku), product]));
  const manualProducts = MANUAL_RECEIPT_SKUS.map((sku) => bySku.get(sku)).filter(Boolean);
  const stock = (sku: string) => integerToBigInt(bySku.get(sku)?.stockMilli);
  const egg = bySku.get("EGG-001");
  const eggStock = egg ? formatEggStock(integerToBigInt(egg.stockMilli), Number(egg.piecesPerTray ?? 30)) : null;
  const totalValue = products
    .filter((product) => product.inventoryManaged === true)
    .reduce((sum, product) => sum + multiplyQuantityRate(integerToBigInt(product.stockMilli), integerToBigInt(product.averageCostPaisa)), 0n);
  const lowCount = products.filter((product) => product.inventoryManaged === true && integerToBigInt(product.stockMilli) > 0n && integerToBigInt(product.stockMilli) <= integerToBigInt(product.lowStockMilli)).length;
  const outCount = products.filter((product) => product.inventoryManaged === true && integerToBigInt(product.stockMilli) <= 0n).length;

  const cards: Array<[string, string]> = [
    ["Fresh Milk available", `${formatMilli(stock("MILK-001"))} L`],
    ["Bread packets available", formatMilli(stock("BREAD-001"))],
    ["Eggs available", eggStock ? `${eggStock.label} · ${eggStock.totalPieces} total eggs` : formatMilli(stock("EGG-001"))],
    ["Egg average cost", egg ? formatPKR(integerToBigInt(egg.averageCostPaisa)) : "PKR 0.00"],
    ["Egg piece price", egg ? formatPKR(integerToBigInt(egg.pieceSellingRatePaisa ?? egg.retailRatePaisa)) : "PKR 0.00"],
    ["Egg tray price", egg ? formatPKR(integerToBigInt(egg.traySellingRatePaisa ?? 0)) : "PKR 0.00"],
    ["Egg stock value", egg ? formatPKR(multiplyQuantityRate(integerToBigInt(egg.stockMilli), integerToBigInt(egg.averageCostPaisa))) : "PKR 0.00"],
    ["Ispaghol packets available", formatMilli(stock("ISPAGHOL-001"))],
    ["Purchased inventory value", formatPKR(totalValue)],
    ["Low-stock products", String(lowCount)],
    ["Out-of-stock products", String(outCount)],
  ];

  return (
    <div className="content">
      <div className="customer-heading">
        <div>
          <div className="title">Inventory</div>
          <div className="subtitle">
            Receive stock, review receipts and keep Egg stock in whole pieces.
          </div>
        </div>
        <AddInventoryForm
          today={karachiBusinessDate()}
          products={products.map((product) => ({
            sku: String(product.sku),
            name: String(product.name),
            unit: String(product.unit),
            stockMilli: integerToBigInt(product.stockMilli).toString(),
            averageCostPaisa: integerToBigInt(product.averageCostPaisa).toString(),
            retailRatePaisa: integerToBigInt(product.retailRatePaisa).toString(),
          }))}
        />
      </div>

      <div className="summary-grid">
        {cards.map(([label, value]) => (
          <div className="card" key={label}>
            <small>{label}</small>
            <b>{value}</b>
          </div>
        ))}
      </div>

      <div className="card table-card table-scroll">
        {receipts.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Subtotal</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt._id.toString()}>
                  <td><b>{String(receipt.transactionNo)}</b></td>
                  <td>{String(receipt.businessDate)}</td>
                  <td>{String(receipt.supplierName ?? "-")}</td>
                  <td>{formatPKR(integerToBigInt(receipt.subtotalPaisa))}</td>
                  <td>{String(receipt.paymentStatus)}</td>
                  <td><span className="badge">{String(receipt.status)}</span></td>
                  <td><ReceiptReversal transactionNo={String(receipt.transactionNo)} status={String(receipt.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <b>No inventory receipts yet</b>
            <span>Use Add Inventory to receive bread, eggs or Ispaghol.</span>
          </div>
        )}
      </div>

      <div className="card table-card">
        <div className="section-title">Manual receipt products</div>
        <div className="summary-grid">
          {manualProducts.map((product) => (
            <div className="card" key={String(product?._id ?? product?.sku)}>
              <small>{String(product?.name ?? product?.sku)}</small>
              <b>
                {formatMilli(integerToBigInt(product?.stockMilli))} {String(product?.unit ?? "")}
              </b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
