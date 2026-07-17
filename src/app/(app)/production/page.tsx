import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatMilli,
  formatPKR,
  integerToBigInt,
  multiplyQuantityRate,
} from "@/lib/money";
import { karachiBusinessDate } from "@/lib/queries";
import { YOGURT_PRODUCTION_DEFAULTS } from "@/lib/yogurt-production-calculations";
import {
  ProductionForm,
  ProductionPrintButton,
  ProductionReversal,
} from "./production-form";
export const dynamic = "force-dynamic";
export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireSession(),
    filters = await searchParams,
    database = await db(),
    today = karachiBusinessDate(),
    match: Record<string, unknown> = { yogurtProductSku: "YOG-001" };
  if (filters.date) match.businessDate = filters.date;
  const [milk, yogurt, settings, batches, stats, packagingStats] =
    await Promise.all([
    database.collection("products").findOne({ sku: "MILK-001" }),
    database.collection("products").findOne({ sku: "YOG-001" }),
    database
      .collection("business_settings")
      .findOne({ _id: "default" as never }),
    database
      .collection("production_batches")
      .find(match)
      .sort({ businessDate: -1, createdAt: -1 })
      .limit(100)
      .toArray(),
    database
      .collection("production_batches")
      .aggregate([
        {
          $match: {
            businessDate: today,
            status: "posted",
            yogurtProductSku: "YOG-001",
          },
        },
        {
          $group: {
            _id: null,
            milk: {
              $sum: { $ifNull: ["$actualMilkUsedMilli", "$milkUsedMilli"] },
            },
            output: {
              $sum: {
                $ifNull: ["$actualYogurtOutputMilli", "$actualOutputMilli"],
              },
            },
            loss: { $sum: "$processingLossMilli" },
            profit: { $sum: "$estimatedGrossProfitPaisa" },
            automatic: {
              $sum: {
                $cond: [{ $eq: ["$productionMode", "automatic"] }, 1, 0],
              },
            },
            manual: {
              $sum: { $cond: [{ $eq: ["$productionMode", "manual"] }, 1, 0] },
            },
            kundas: { $sum: { $sum: "$kundaEntries.numberOfKundas" } },
          },
        },
      ])
      .next(),
    database
      .collection("yogurt_packaging_movements")
      .aggregate([
        { $match: { status: "posted" } },
        {
          $group: {
            _id: "$kundaSizeMilliKg",
            produced: {
              $sum: {
                $cond: [{ $gt: ["$countChange", 0] }, "$countChange", 0],
              },
            },
            sold: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $lt: ["$countChange", 0] },
                      { $eq: ["$sourceType", "shop_sale"] },
                    ],
                  },
                  { $abs: "$countChange" },
                  0,
                ],
              },
            },
            remaining: { $sum: "$countChange" },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
  ]);
  const milkStock = integerToBigInt(milk?.stockMilli),
    yogurtStock = integerToBigInt(yogurt?.stockMilli),
    yogurtCost = integerToBigInt(yogurt?.averageCostPaisa),
    yogurtRate = integerToBigInt(yogurt?.retailRatePaisa),
    milkTotal = integerToBigInt(stats?.milk),
    outputTotal = integerToBigInt(stats?.output),
    yieldValue = milkTotal > 0n ? (outputTotal * 1000n) / milkTotal : 0n,
    milkRatio = integerToBigInt(
      settings?.yogurtAutomaticMilkRatioParts,
      YOGURT_PRODUCTION_DEFAULTS.milkRatioParts,
    ),
    yogurtRatio = integerToBigInt(
      settings?.yogurtAutomaticOutputRatioParts,
      YOGURT_PRODUCTION_DEFAULTS.yogurtRatioParts,
    ),
    standardYield = integerToBigInt(
      settings?.yogurtAutomaticYieldMilli,
      YOGURT_PRODUCTION_DEFAULTS.standardYieldMilli,
    ),
    tolerance = integerToBigInt(
      settings?.yogurtYieldToleranceMilli,
      YOGURT_PRODUCTION_DEFAULTS.yieldToleranceMilli,
    ),
    inventoryUnit =
      (settings?.milkInventoryUnit ?? milk?.unit) === "kilogram"
        ? "kilogram"
        : "liter";
  const cards = [
    ["Fresh Milk available", `${formatMilli(milkStock)} ${inventoryUnit}`],
    ["Yogurt available", `${formatMilli(yogurtStock)} kg`],
    ["Yogurt selling price", `${formatPKR(yogurtRate)} / kg`],
    ["Yogurt average cost", `${formatPKR(yogurtCost)} / kg`],
    [
      "Yogurt stock value",
      formatPKR(multiplyQuantityRate(yogurtStock, yogurtCost)),
    ],
    ["Milk converted today", `${formatMilli(milkTotal)} kg`],
    ["Yogurt produced today", `${formatMilli(outputTotal)} kg`],
    [
      "Processing loss today",
      `${formatMilli(integerToBigInt(stats?.loss))} kg`,
    ],
    ["Kundas prepared today", String(stats?.kundas ?? 0)],
    ["Actual yield today", `${formatMilli(yieldValue * 100n)}%`],
    ["Standard yield", `${formatMilli(standardYield * 100n)}%`],
    [
      "Automatic / Manual",
      `${Number(stats?.automatic ?? 0)} / ${Number(stats?.manual ?? 0)}`,
    ],
    ["Estimated gross margin", formatPKR(integerToBigInt(stats?.profit))],
  ];
  const packagingRows = packagingStats.map((row) => ({
    size: integerToBigInt(row._id),
    produced: integerToBigInt(row.produced),
    sold: integerToBigInt(row.sold),
    remaining: integerToBigInt(row.remaining),
  }));
  return (
    <div className="content">
      <div className="customer-heading">
        <div>
          <div className="title">Yogurt / Kunda Production</div>
          <div className="subtitle">
            Standard: {milkRatio.toString()} kg Milk → {yogurtRatio.toString()}{" "}
            kg Yogurt, with actual Manual production when needed.
          </div>
        </div>
        <ProductionForm
          today={today}
          milkStockMilli={milkStock.toString()}
          milkCostPaisa={integerToBigInt(milk?.averageCostPaisa).toString()}
          yogurtRatePaisa={yogurtRate.toString()}
          milkRatioParts={milkRatio.toString()}
          yogurtRatioParts={yogurtRatio.toString()}
          standardYieldMilli={standardYield.toString()}
          yieldToleranceMilli={tolerance.toString()}
          defaultMode={
            settings?.yogurtDefaultProductionMode === "manual"
              ? "manual"
              : "automatic"
          }
          milkInventoryUnit={inventoryUnit}
          milkDensityMilli={
            settings?.milkDensityMilliKgPerLiter
              ? integerToBigInt(settings.milkDensityMilliKgPerLiter).toString()
              : undefined
          }
        />
      </div>
      <section className="grid kpis production-kpis">
        {cards.map(([label, value]) => (
          <article className="card" key={label}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{value}</div>
          </article>
        ))}
      </section>
      <div className="card table-card">
        <div className="section-title">Kundas produced versus sold</div>
        {packagingRows.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Kunda size</th>
                  <th>Prepared</th>
                  <th>Sold</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {packagingRows.map((row) => (
                  <tr key={row.size.toString()}>
                    <td>{formatMilli(row.size)} kg</td>
                    <td>{row.produced.toString()}</td>
                    <td>{row.sold.toString()}</td>
                    <td>
                      <b>{row.remaining.toString()}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <b>No Kundas allocated yet</b>
            <span>Create a Yogurt batch and allocate its finished Yogurt.</span>
          </div>
        )}
      </div>
      <div className="card table-card">
        <div className="customer-heading">
          <div className="section-title">Yogurt production history</div>
          <form className="toolbar">
            <input type="date" name="date" defaultValue={filters.date} />
            <button className="button secondary">Filter</button>
          </form>
        </div>
        {batches.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Date</th>
                  <th>Mode</th>
                  <th>Milk</th>
                  <th>Yogurt</th>
                  <th>Loss</th>
                  <th>Yield</th>
                  <th>Standard</th>
                  <th>Variance</th>
                  <th>Kundas</th>
                  <th>Cost/kg</th>
                  <th>Sell/kg</th>
                  <th>Est. profit</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => {
                  const entries = (batch.kundaEntries ?? []) as Array<
                      Record<string, unknown>
                    >,
                    kundaCount = entries.reduce(
                      (sum, e) => sum + Number(e.numberOfKundas ?? 0),
                      0,
                    ),
                    actualMilk = integerToBigInt(
                      batch.actualMilkUsedMilli,
                      batch.milkUsedMilli,
                    ),
                    actualOutput = integerToBigInt(
                      batch.actualYogurtOutputMilli,
                      batch.actualOutputMilli,
                    );
                  return (
                    <tr key={batch._id.toString()}>
                      <td>
                        <b>{String(batch.transactionNo)}</b>
                      </td>
                      <td>{String(batch.businessDate)}</td>
                      <td>{String(batch.productionMode ?? "legacy")}</td>
                      <td>{formatMilli(actualMilk)} kg</td>
                      <td>{formatMilli(actualOutput)} kg</td>
                      <td>
                        {batch.processingLossMilli !== undefined
                          ? `${formatMilli(integerToBigInt(batch.processingLossMilli))} kg`
                          : "—"}
                      </td>
                      <td>
                        {batch.actualYieldMilli !== undefined
                          ? `${formatMilli(integerToBigInt(batch.actualYieldMilli) * 100n)}%`
                          : "—"}
                      </td>
                      <td>
                        {batch.standardYieldMilli !== undefined
                          ? `${formatMilli(integerToBigInt(batch.standardYieldMilli) * 100n)}%`
                          : "Legacy"}
                      </td>
                      <td>
                        {batch.yieldVarianceMilli !== undefined
                          ? `${formatMilli(integerToBigInt(batch.yieldVarianceMilli))} kg`
                          : "—"}
                      </td>
                      <td>{kundaCount}</td>
                      <td>
                        {formatPKR(integerToBigInt(batch.yogurtUnitCostPaisa))}
                      </td>
                      <td>
                        {formatPKR(
                          integerToBigInt(batch.yogurtSellingRatePaisa),
                        )}
                      </td>
                      <td>
                        {formatPKR(
                          integerToBigInt(batch.estimatedGrossProfitPaisa),
                        )}
                      </td>
                      <td>
                        <span className="badge">{String(batch.status)}</span>
                      </td>
                      <td>
                        <div className="toolbar">
                          <details>
                            <summary className="button secondary">View</summary>
                            <div className="receipt-popover">
                              <b>{String(batch.transactionNo)}</b>
                              <p>
                                {String(
                                  batch.varianceReason ??
                                    batch.notes ??
                                    "No notes",
                                )}
                              </p>
                              <p>
                                Inventory Milk used:{" "}
                                {formatMilli(
                                  integerToBigInt(
                                    batch.convertedMilkInventoryQuantityMilli,
                                    batch.milkUsedMilli,
                                  ),
                                )}{" "}
                                {String(
                                  batch.milkInventoryUnit ??
                                    milk?.unit ??
                                    "unit",
                                )}
                              </p>
                            </div>
                          </details>
                          <ProductionPrintButton />
                          {session.role === "owner" ? (
                            <ProductionReversal
                              transactionNo={String(batch.transactionNo)}
                              status={String(batch.status)}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <b>No Yogurt batches yet</b>
            <span>
              Create a Yogurt Batch to convert Fresh Milk into sellable Yogurt.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
