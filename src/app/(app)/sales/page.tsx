import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { businessDateFilter } from "@/lib/date-utils";
import { DateFilter } from "@/components/date-filter";
import { formatPKR, integerToBigInt } from "@/lib/money";
import { karachiBusinessDate } from "@/lib/queries";
import { ShopSaleForm, ShopSaleReversal } from "./shop-sale-form";
import { FilterToolbar, PageHeader, SearchField, SectionHeader } from "@/components/ui";
import { escapedSearchPattern, normalizeSearchQuery } from "@/lib/search";
import { ClearSearch } from "@/components/clear-search";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; q?: string }> }) {
  const session = await requireSession();
  const { from, to, q: rawQuery } = await searchParams;
  const q = normalizeSearchQuery(rawQuery);
  const database = await db();
  const today = karachiBusinessDate();
  const saleMatch: Record<string, unknown> = businessDateFilter(from, to) ?? {};
  const searchPattern = escapedSearchPattern(q);
  if (searchPattern) {
    saleMatch.$or = [{ transactionNo: searchPattern }, { customerNameSnapshot: searchPattern }];
  }
  const [settings, products, customers, sales] = await Promise.all([
    database.collection("business_settings").findOne({ _id: "default" as never }),
    database.collection("products").find({ active: true, sellable: true, inventoryManaged: true, internalOnly: { $ne: true }, sku: { $ne: "KUNDA-001" } }).sort({ name: 1 }).toArray(),
    database.collection("customers").find({ active: true, customerType: "shop" }).sort({ name: 1 }).toArray(),
    database.collection("sales").find({ channel: "shop", ...saleMatch }).sort({ createdAt: -1 }).limit(100).toArray(),
  ]);
  const milkRatePaisa = integerToBigInt(settings?.shopRatePaisa);

  return (
    <div className="content">
      <PageHeader title="Shop Sales" description="Fast Paid Now and Credit/Udhaar sales. Walk-in Cash sales need no customer." actions={<ShopSaleForm
          today={today}
          products={products.map((product) => ({
            sku: String(product.sku),
            name: String(product.name),
            unit: String(product.unit),
            ratePaisa: String(product.sku === "MILK-001" && integerToBigInt(product.retailRatePaisa) <= 0n ? milkRatePaisa : integerToBigInt(product.retailRatePaisa)),
            stockMilli: integerToBigInt(product.stockMilli).toString(),
            pieceSellingRatePaisa: integerToBigInt(product.pieceSellingRatePaisa ?? product.retailRatePaisa).toString(),
            traySellingRatePaisa: integerToBigInt(product.traySellingRatePaisa).toString(),
            piecesPerTray: Number(product.piecesPerTray ?? 30),
            defaultSaleUnit: (product.defaultSaleUnit ?? "piece") as "piece" | "tray",
          }))}
          customers={customers.map((customer) => ({
            id: customer._id.toString(),
            name: String(customer.name),
            code: String(customer.code),
          }))}
        />}/>
      <SectionHeader title="Shop sales history" description="Search and review the latest operational sales." actions={<DateFilter/>}/>
      <form>
        <input type="hidden" name="from" value={from ?? ""} />
        <input type="hidden" name="to" value={to ?? ""} />
        <FilterToolbar>
          <SearchField defaultValue={q} placeholder="Search receipt or customer" />
          <button className="button secondary">Search</button>
          {q ? <ClearSearch/> : null}
          {q ? <span className="result-count">{sales.length} results</span> : null}
        </FilterToolbar>
      </form>
      <div className="card table-card table-scroll">
        {sales.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Payment</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale._id.toString()}>
                  <td><b>{String(sale.transactionNo)}</b></td>
                  <td>{String(sale.businessDate)}</td>
                  <td>{String(sale.customerNameSnapshot ?? "Walk-in customer")}</td>
                  <td>{sale.paymentType === "credit" ? "Credit / Udhaar" : `Paid Now · ${String(sale.paymentMethod)}`}</td>
                  <td>{formatPKR(integerToBigInt(sale.totalPaisa))}</td>
                  <td><span className="badge">{String(sale.status)}</span></td>
                  <td>{session.role === "owner" && sale.status === "posted" ? <ShopSaleReversal transactionNo={String(sale.transactionNo)} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <b>No Shop Sales yet</b>
            <span>Use New Shop Sale for Cash/Paid Now or Credit/Udhaar.</span>
          </div>
        )}
      </div>
    </div>
  );
}
