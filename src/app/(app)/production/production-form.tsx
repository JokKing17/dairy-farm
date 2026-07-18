"use client";
import { useActionState, useMemo, useState } from "react";
import {
  formatMilli,
  formatPKR,
  quantityToMilli,
  rupeesToPaisa,
} from "@/lib/money";
import {
  calculateActualYield,
  calculateAutomaticMilkRequirement,
  calculateAutomaticYogurtOutput,
  calculateKundaOutput,
  calculateProductionLoss,
  calculateYogurtProduction,
  convertMilkWeightToInventoryQuantity,
  suggestKundaBreakdown,
} from "@/lib/yogurt-production-calculations";
import {
  createYogurtBatch,
  reverseYogurtBatch,
  type ProductionReversalState,
  type ProductionState,
} from "./actions";
type Kunda = {
  id: string;
  size: "3" | "3.5" | "custom";
  customSize: string;
  count: string;
  notes: string;
};
type Props = {
  today: string;
  milkStockMilli: string;
  milkCostPaisa: string;
  yogurtRatePaisa: string;
  milkRatioParts: string;
  yogurtRatioParts: string;
  standardYieldMilli: string;
  yieldToleranceMilli: string;
  defaultMode: "automatic" | "manual";
  milkInventoryUnit: "liter" | "kilogram";
  milkDensityMilli?: string;
};
const blankCosts = {
  starter: "0",
  gas: "0",
  electricity: "0",
  labour: "0",
  packaging: "0",
  other: "0",
};
export function ProductionForm(props: Props) {
  const [state, action, pending] = useActionState(
      createYogurtBatch,
      {} as ProductionState,
    ),
    [open, setOpen] = useState(false),
    [review, setReview] = useState(false),
    [key] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState<"automatic" | "manual">(props.defaultMode),
    [direction, setDirection] = useState<"milk-to-yogurt" | "yogurt-to-milk">(
      "milk-to-yogurt",
    ),
    [date, setDate] = useState(props.today),
    [milk, setMilk] = useState(""),
    [actualOutput, setActualOutput] = useState(""),
    [price, setPrice] = useState(
      props.yogurtRatePaisa === "0"
        ? ""
        : (Number(props.yogurtRatePaisa) / 100).toFixed(2),
    ),
    [loose, setLoose] = useState("0"),
    [varianceReason, setVarianceReason] = useState(""),
    [notes, setNotes] = useState(""),
    [payment, setPayment] = useState("");
  const [costs, setCosts] = useState(blankCosts),
    [kundas, setKundas] = useState<Kunda[]>([
      { id: "3kg", size: "3", customSize: "", count: "0", notes: "" },
      { id: "35kg", size: "3.5", customSize: "", count: "0", notes: "" },
    ]),
    milkRatio = BigInt(props.milkRatioParts),
    yogurtRatio = BigInt(props.yogurtRatioParts);
  const preview = useMemo(() => {
    try {
      const parsed = kundas
          .filter((k) => Number(k.count) > 0)
          .map((k) => ({
            sizeMilliKg: quantityToMilli(
              k.size === "custom" ? k.customSize : k.size,
            ),
            numberOfKundas: Number(k.count),
          })),
        kundaOutput = calculateKundaOutput(parsed),
        enteredLoose = quantityToMilli(loose || "0"),
        requiredOutput = kundaOutput + enteredLoose;
      let milkWeight =
          mode === "automatic" && direction === "yogurt-to-milk"
            ? 1n
            : quantityToMilli(milk),
        output: bigint,
        effectiveLoose = enteredLoose,
        recommendedMilk = milkWeight;
      if (mode === "automatic" && direction === "yogurt-to-milk") {
        output = requiredOutput;
        recommendedMilk = calculateAutomaticMilkRequirement(
          output,
          milkRatio,
          yogurtRatio,
        );
        milkWeight = recommendedMilk;
      } else if (mode === "automatic") {
        output = calculateAutomaticYogurtOutput(
          milkWeight,
          milkRatio,
          yogurtRatio,
        );
        effectiveLoose = output - kundaOutput;
        if (effectiveLoose < 0n)
          throw new Error(
            "Kundas require more Yogurt than this Milk can produce.",
          );
      } else output = quantityToMilli(actualOutput);
      const inventoryQuantity = convertMilkWeightToInventoryQuantity(
          milkWeight,
          props.milkInventoryUnit,
          props.milkDensityMilli ? BigInt(props.milkDensityMilli) : undefined,
        ),
        calculated = calculateYogurtProduction({
          milkWeightMilli: milkWeight,
          milkInventoryQuantityMilli: inventoryQuantity,
          milkAverageCostPaisa: BigInt(props.milkCostPaisa),
          actualOutputMilli: output,
          kundaEntries: parsed,
          looseYogurtMilli: effectiveLoose,
          additionalCostsPaisa: Object.values(costs).map(rupeesToPaisa),
          sellingRatePaisa: rupeesToPaisa(price),
          milkRatioParts: milkRatio,
          yogurtRatioParts: yogurtRatio,
        }),
        standard = calculateAutomaticYogurtOutput(
          milkWeight,
          milkRatio,
          yogurtRatio,
        );
      return {
        ...calculated,
        milkWeight,
        inventoryQuantity,
        output,
        effectiveLoose,
        recommendedMilk,
        standard,
        variance: output - standard,
        actualYield: calculateActualYield(milkWeight, output),
        loss: calculateProductionLoss(milkWeight, output),
      };
    } catch {
      return null;
    }
  }, [
    kundas,
    loose,
    milk,
    actualOutput,
    mode,
    direction,
    props.milkInventoryUnit,
    props.milkDensityMilli,
    props.milkCostPaisa,
    costs,
    price,
    milkRatio,
    yogurtRatio,
  ]);
  const payload = JSON.stringify({
      businessDate: date,
      idempotencyKey: key,
      productionMode: mode,
      calculationDirection: direction,
      milkWeight: preview ? formatMilli(preview.milkWeight) : milk,
      actualYogurtOutput: mode === "manual" ? actualOutput : undefined,
      sellingPrice: price,
      kundas: kundas.map((k) => ({
        size: k.size,
        customSize: k.customSize,
        count: Number(k.count),
        notes: k.notes,
      })),
      looseYogurt: preview ? formatMilli(preview.effectiveLoose) : loose,
      varianceReason,
      costs,
      processingPaymentMethod: payment || undefined,
      notes,
    }),
    update = (id: string, change: Partial<Kunda>) =>
      setKundas((rows) =>
        rows.map((row) => (row.id === id ? { ...row, ...change } : row)),
      );
  const suggest = () => {
    if (!preview) return;
    const suggestion = suggestKundaBreakdown(preview.output);
    setKundas([
      {
        id: "3kg",
        size: "3",
        customSize: "",
        count: String(suggestion.threeKg),
        notes: "",
      },
      {
        id: "35kg",
        size: "3.5",
        customSize: "",
        count: String(suggestion.threePointFiveKg),
        notes: "",
      },
    ]);
    setLoose(formatMilli(suggestion.looseMilli));
  };
  const percentage = (milli: bigint) => `${formatMilli(milli * 100n)}%`,
    varianceLabel = preview
      ? preview.variance === 0n
        ? "Matches standard"
        : preview.variance > 0n
          ? `Above standard by ${formatMilli(preview.variance)} kg`
          : `Below standard by ${formatMilli(-preview.variance)} kg`
      : "";
  return (
    <>
      <button
        className="button production-primary"
        onClick={() => setOpen(true)}
      >
        Create Yogurt Batch
      </button>
      {open ? (
        <div className="review-dialog" role="dialog" aria-modal="true" aria-label="Review Yogurt batch">
          <form action={action} className="card production-form">
            <input type="hidden" name="payload" value={payload} />
            <div className="customer-heading">
              <div>
                <div className="section-title">Create Yogurt Batch</div>
                <div className="subtitle">
                  Standard: {props.milkRatioParts} kg Milk →{" "}
                  {props.yogurtRatioParts} kg Yogurt.
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
            {props.milkInventoryUnit === "liter" && !props.milkDensityMilli ? (
              <div className="form-error">
                Set Milk density in Business Settings before creating a Yogurt
                batch. Kilograms cannot be deducted from liter inventory without
                this conversion.
              </div>
            ) : null}
            {state.error ? (
              <div className="form-error">{state.error}</div>
            ) : null}
            {state.result ? (
              <div className="form-success">
                <b>Posted {state.result.transactionNo}</b>
                <span>
                  {formatMilli(BigInt(state.result.milkUsedMilli))} kg Milk
                  produced {formatMilli(BigInt(state.result.yogurtOutputMilli))}{" "}
                  kg Yogurt.
                </span>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => window.print()}
                >
                  Print
                </button>
              </div>
            ) : null}
            <div className="formgrid">
              <div className="field">
                <label>Production mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                >
                  <option value="automatic">
                    Automatic ({props.milkRatioParts} kg Milk →{" "}
                    {props.yogurtRatioParts} kg Yogurt)
                  </option>
                  <option value="manual">
                    Manual (Enter Actual Quantities)
                  </option>
                </select>
              </div>
              {mode === "automatic" ? (
                <div className="field">
                  <label>What do you know?</label>
                  <select
                    value={direction}
                    onChange={(e) =>
                      setDirection(e.target.value as typeof direction)
                    }
                  >
                    <option value="milk-to-yogurt">
                      I know the Milk quantity
                    </option>
                    <option value="yogurt-to-milk">
                      I know the Yogurt/Kunda requirement
                    </option>
                  </select>
                </div>
              ) : null}
              <div className="field">
                <label>Business date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Milk weighed for production (kg)</label>
                <input
                  inputMode="decimal"
                  value={
                    direction === "yogurt-to-milk" &&
                    mode === "automatic" &&
                    preview
                      ? formatMilli(preview.recommendedMilk)
                      : milk
                  }
                  readOnly={
                    direction === "yogurt-to-milk" && mode === "automatic"
                  }
                  onChange={(e) => setMilk(e.target.value)}
                  autoFocus
                />
                <small>
                  Inventory available:{" "}
                  {formatMilli(BigInt(props.milkStockMilli))}{" "}
                  {props.milkInventoryUnit}
                </small>
              </div>
              {mode === "manual" ? (
                <div className="field">
                  <label>Actual Yogurt produced (kg)</label>
                  <input
                    inputMode="decimal"
                    value={actualOutput}
                    onChange={(e) => setActualOutput(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="field">
                <label>Yogurt selling price per kilogram</label>
                <input
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>
          <div className="section-title production-section">
            Step 2: How was the Yogurt placed?
          </div>
          <p className="subtitle">
            Allocate already-produced Yogurt into Kundas. This allocation does
            not deduct Yogurt stock.
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={!preview}
            onClick={suggest}
          >
            Suggest Kunda Breakdown
          </button>
            {kundas.map((k) => (
              <div className="kunda-row" key={k.id}>
                <select
                  value={k.size}
                  onChange={(e) =>
                    update(k.id, { size: e.target.value as Kunda["size"] })
                  }
                >
                  <option value="3">3 kg Kunda</option>
                  <option value="3.5">3.5 kg Kunda</option>
                  <option value="custom">Custom size</option>
                </select>
                {k.size === "custom" ? (
                  <input
                    inputMode="decimal"
                    placeholder="Weight in kg"
                    value={k.customSize}
                    onChange={(e) =>
                      update(k.id, { customSize: e.target.value })
                    }
                  />
                ) : null}
                <input
                  inputMode="numeric"
                  placeholder="Number of Kundas"
                  value={k.count}
                  onChange={(e) => update(k.id, { count: e.target.value })}
                />
                <input
                  placeholder="Note (optional)"
                  value={k.notes}
                  onChange={(e) => update(k.id, { notes: e.target.value })}
                />
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    setKundas((rows) => rows.filter((row) => row.id !== k.id))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                setKundas((rows) => [
                  ...rows,
                  {
                    id: crypto.randomUUID(),
                    size: "custom",
                    customSize: "",
                    count: "1",
                    notes: "",
                  },
                ])
              }
            >
              Add custom Kunda size
            </button>
            <div className="field production-loose">
              <label>
                Loose Yogurt (kg)
                {mode === "automatic" && direction === "milk-to-yogurt"
                  ? " — calculated remainder"
                  : ""}
              </label>
              <input
                inputMode="decimal"
                value={
                  mode === "automatic" &&
                  direction === "milk-to-yogurt" &&
                  preview
                    ? formatMilli(preview.effectiveLoose)
                    : loose
                }
                readOnly={
                  mode === "automatic" && direction === "milk-to-yogurt"
                }
                onChange={(e) => setLoose(e.target.value)}
              />
            </div>
            <div className="section-title production-section">
              Additional production costs
            </div>
            <div className="formgrid">
              {Object.keys(costs).map((name) => (
                <div className="field" key={name}>
                  <label>{name[0].toUpperCase() + name.slice(1)} cost</label>
                  <input
                    inputMode="decimal"
                    value={costs[name as keyof typeof costs]}
                    onChange={(e) =>
                      setCosts((old) => ({ ...old, [name]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <div className="field">
                <label>Paid from (optional)</label>
                <select
                  value={payment}
                  onChange={(e) => setPayment(e.target.value)}
                >
                  <option value="">Not paid now</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="jazzcash">JazzCash</option>
                </select>
              </div>
              <div className="field">
                <label>Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              {mode === "manual" ? (
                <div className="field">
                  <label>
                    Variance reason (required outside{" "}
                    {percentage(
                      BigInt(props.standardYieldMilli) -
                        BigInt(props.yieldToleranceMilli),
                    )}
                    –
                    {percentage(
                      BigInt(props.standardYieldMilli) +
                        BigInt(props.yieldToleranceMilli),
                    )}
                    )
                  </label>
                  <textarea
                    value={varianceReason}
                    onChange={(e) => setVarianceReason(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
            {preview ? (
              <div className="inventory-preview">
                {[
                  [
                    "Production mode",
                    mode === "automatic" ? "Automatic" : "Manual",
                  ],
                  [
                    "Standard",
                    `${props.milkRatioParts} kg → ${props.yogurtRatioParts} kg`,
                  ],
                  ["Milk weighed", `${formatMilli(preview.milkWeight)} kg`],
                  [
                    "Milk inventory deduction",
                    `${formatMilli(preview.inventoryQuantity)} ${props.milkInventoryUnit}`,
                  ],
                  [
                    "Standard expected Yogurt",
                    `${formatMilli(preview.standard)} kg`,
                  ],
                  ["Actual/posted Yogurt", `${formatMilli(preview.output)} kg`],
                  ["Processing loss", `${formatMilli(preview.loss)} kg`],
                  ["Actual yield", percentage(preview.actualYield)],
                  ["Variance", varianceLabel],
                  [
                    "Total batch cost",
                    formatPKR(preview.totalProductionCostPaisa),
                  ],
                  ["Cost per kg", formatPKR(preview.yogurtUnitCostPaisa)],
                  [
                    "Estimated profit",
                    formatPKR(preview.estimatedGrossProfitPaisa),
                  ],
                ].map(([label, value]) => (
                  <span key={label}>
                    <small>{label}</small>
                    <b>{value}</b>
                  </span>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="button"
              disabled={!preview || pending || Boolean(state.result)}
              onClick={() => setReview(true)}
            >
              Review Yogurt Batch
            </button>
            {review && preview ? (
              <div className="review-dialog nested" role="dialog" aria-modal="true" aria-label="Confirm Yogurt batch reversal">
                <div className="card review-card">
                  <div className="section-title">Confirm Yogurt production</div>
                  {state.error ? (
                    <div className="form-error" role="alert">
                      {state.error}
                    </div>
                  ) : null}
                  <div className="review-line">
                    <span>Production mode</span>
                    <b>{mode === "automatic" ? "Automatic" : "Manual"}</b>
                  </div>
                  <div className="review-line">
                    <span>Milk weighed</span>
                    <b>{formatMilli(preview.milkWeight)} kg</b>
                  </div>
                  <div className="review-line">
                    <span>Yogurt produced</span>
                    <b>{formatMilli(preview.output)} kg</b>
                  </div>
                  <div className="review-line">
                    <span>Processing loss</span>
                    <b>{formatMilli(preview.loss)} kg</b>
                  </div>
                  <div className="review-line">
                    <span>Yield</span>
                    <b>{percentage(preview.actualYield)}</b>
                  </div>
                  <div className="review-line">
                    <span>Total batch cost</span>
                    <b>{formatPKR(preview.totalProductionCostPaisa)}</b>
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
export function ProductionReversal({
  transactionNo,
  status,
}: {
  transactionNo: string;
  status: string;
}) {
  const [state, action, pending] = useActionState(
      reverseYogurtBatch,
      {} as ProductionReversalState,
    ),
    [open, setOpen] = useState(false);
  if (status !== "posted") return null;
  return (
    <>
      <button
        type="button"
        className="button secondary"
        onClick={() => setOpen(true)}
      >
        Reverse
      </button>
      {open ? (
        <div className="review-dialog" role="dialog" aria-modal="true" aria-label="Yogurt batch details">
          <form action={action} className="card review-card">
            <input type="hidden" name="transactionNo" value={transactionNo} />
            <div className="section-title">Reverse {transactionNo}?</div>
            <p>
              The original Milk conversion and Yogurt output snapshots will be
              used.
            </p>
            <div className="field">
              <label>Reason</label>
              <textarea name="reason" required minLength={5} />
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
      ) : null}
    </>
  );
}
export function ProductionPrintButton() {
  return (
    <button
      type="button"
      className="button secondary"
      onClick={() => window.print()}
    >
      Print
    </button>
  );
}
