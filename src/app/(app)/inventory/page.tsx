import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { businessDateFilter } from "@/lib/date-utils";
import { MANUAL_RECEIPT_SKUS } from "@/lib/inventory-calculations";
import { DateFilter } from "@/components/date-filter";
import { formatPKR, integerToBigInt } from "@/lib/money";
import { karachiBusinessDate } from "@/lib/queries";
import { AddInventoryForm, ReceiptReversal } from "./inventory-form";
import { FilterToolbar, PageHeader, SearchField, SectionHeader } from "@/components/ui";
import { escapedSearchPattern, normalizeSearchQuery } from "@/lib/search";
import { ClearSearch } from "@/components/clear-search";

export const dynamic = "force-dynamic";

const visibleSkus = ["MILK-001", ...MANUAL_RECEIPT_SKUS];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; product?: string; supplier?: string; q?: string }>;
}) {
  await requireSession();
  const filters = await searchParams;
  const q = normalizeSearchQuery(filters.q);
  const database = await db();
  const receiptMatch: Record<string, unknown> = {};
  const dateFilter = businessDateFilter(filters.from, filters.to);
  if (dateFilter) Object.assign(receiptMatch, dateFilter);
  if (filters.supplier) receiptMatch.supplierName = { $regex: filters.supplier, $options: "i" };
  if (filters.product) receiptMatch["lines.productSku"] = filters.product;
  const searchPattern = escapedSearchPattern(q);
  if (searchPattern) {
    receiptMatch.$or = [{ transactionNo: searchPattern }, { supplierName: searchPattern }, { "lines.productName": searchPattern }];
  }

  const [products, receipts] = await Promise.all([
    database.collection("products").find({ sku: { $in: visibleSkus }, internalOnly: { $ne: true } }).sort({ name: 1 }).toArray(),
    database.collection("inventory_receipts").find(receiptMatch).sort({ businessDate: -1, createdAt: -1 }).limit(100).toArray(),
  ]);

  return (
    <div className="content">
      <PageHeader title="Inventory" description="Receive stock, review receipts and keep Egg stock in whole pieces." actions={<AddInventoryForm
          today={karachiBusinessDate()}
          products={products.map((product) => ({
            sku: String(product.sku),
            name: String(product.name),
            unit: String(product.unit),
            stockMilli: integerToBigInt(product.stockMilli).toString(),
            averageCostPaisa: integerToBigInt(product.averageCostPaisa).toString(),
            retailRatePaisa: integerToBigInt(product.retailRatePaisa).toString(),
          }))}
        />}/>

      <SectionHeader title="Receipt history" description="Search, print or reverse inventory receipts." actions={<DateFilter/>}/>
      <form>
        <input type="hidden" name="from" value={filters.from ?? ""} />
        <input type="hidden" name="to" value={filters.to ?? ""} />
        <input type="hidden" name="product" value={filters.product ?? ""} />
        <input type="hidden" name="supplier" value={filters.supplier ?? ""} />
        <FilterToolbar>
          <SearchField defaultValue={q} placeholder="Search receipt, supplier or product" />
          <button className="button secondary">Search</button>
          {q ? <ClearSearch/> : null}
          {q ? <span className="result-count">{receipts.length} results</span> : null}
        </FilterToolbar>
      </form>
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

    </div>
  );
}
