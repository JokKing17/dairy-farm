import { describe, expect, it } from "vitest";
import {
  DEFAULT_EGGS_PER_TRAY,
  eggPurchaseCalculation,
  eggSaleCalculation,
  formatEggStock,
  normalizeEggQuantity,
  validatePiecesPerTray,
} from "./egg-units";

describe("egg units", () => {
  it("defaults eggs per tray to 30", () => {
    expect(DEFAULT_EGGS_PER_TRAY).toBe(30);
    expect(validatePiecesPerTray(undefined)).toBe(30);
  });

  it("rejects invalid tray sizes", () => {
    expect(() => validatePiecesPerTray(0)).toThrow();
    expect(() => validatePiecesPerTray(120.5)).toThrow();
  });

  it("normalizes tray receipts into whole pieces", () => {
    expect(normalizeEggQuantity("5", "tray", 30)).toMatchObject({
      enteredQuantity: 5n,
      enteredUnit: "tray",
      normalizedPieces: 150n,
      normalizedQuantityMilli: 150000n,
      piecesPerTraySnapshot: 30,
    });
  });

  it("rejects fractional egg quantities", () => {
    expect(() => normalizeEggQuantity("1.5", "piece", 30)).toThrow();
    expect(() => normalizeEggQuantity("1.25", "tray", 30)).toThrow();
  });

  it("calculates purchase cost per piece from tray buying price", () => {
    expect(
      eggPurchaseCalculation({
        enteredQuantity: 5n,
        enteredUnit: "tray",
        buyingPricePerEnteredUnitPaisa: 3000n,
        piecesPerTray: 30,
        existingStockMilli: 0n,
        existingAverageCostPerPiecePaisa: 0n,
      }),
    ).toMatchObject({
      normalizedPieces: 150n,
      normalizedQuantityMilli: 150000n,
      purchaseTotalPaisa: 15000n,
      purchaseCostPerPiecePaisa: 100n,
      resultingStockMilli: 150000n,
      resultingAverageCostPerPiecePaisa: 100n,
    });
  });

  it("calculates weighted-average egg cost per piece", () => {
    expect(
      eggPurchaseCalculation({
        enteredQuantity: 3n,
        enteredUnit: "tray",
        buyingPricePerEnteredUnitPaisa: 3000n,
        piecesPerTray: 30,
        existingStockMilli: 60000n,
        existingAverageCostPerPiecePaisa: 10n,
      }).resultingAverageCostPerPiecePaisa,
    ).toBe(64n);
  });

  it("calculates piece sales from per-piece pricing", () => {
    expect(
      eggSaleCalculation({
        enteredQuantity: 7n,
        enteredUnit: "piece",
        piecesPerTray: 30,
        pieceRatePaisa: 25n,
        trayRatePaisa: 700n,
        averageCostPerPiecePaisa: 10n,
      }),
    ).toMatchObject({
      normalizedPieces: 7n,
      normalizedQuantityMilli: 7000n,
      sellingRatePerEnteredUnitPaisa: 25n,
      lineAmountPaisa: 175n,
      costOfGoodsSoldPaisa: 70n,
      grossProfitPaisa: 105n,
    });
  });

  it("calculates tray sales from per-tray pricing", () => {
    expect(
      eggSaleCalculation({
        enteredQuantity: 2n,
        enteredUnit: "tray",
        piecesPerTray: 30,
        pieceRatePaisa: 25n,
        trayRatePaisa: 700n,
        averageCostPerPiecePaisa: 10n,
      }),
    ).toMatchObject({
      normalizedPieces: 60n,
      normalizedQuantityMilli: 60000n,
      sellingRatePerEnteredUnitPaisa: 700n,
      lineAmountPaisa: 1400n,
      costOfGoodsSoldPaisa: 600n,
      grossProfitPaisa: 800n,
    });
  });

  it("formats stock as trays plus pieces", () => {
    expect(formatEggStock(67000n, 30)).toMatchObject({
      totalPieces: 67n,
      fullTrays: 2n,
      loosePieces: 7n,
      label: "2 trays + 7 pieces",
    });
  });
});
