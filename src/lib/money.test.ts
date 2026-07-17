import { describe, expect, it } from "vitest";
import { Long } from "mongodb";
import { cashClosing, formatMilli, formatPKR, integerToBigInt, milkReconciliation, multiplyQuantityRate, quantityToMilli, rupeesToPaisa } from "./money";

describe("exact business calculations", () => {
  it("stores money as integer paisa", () => expect(rupeesToPaisa("10800.50")).toBe(1080050n));
  it("normalizes MongoDB aggregation integers returned as Long or number", () => {
    expect(integerToBigInt(Long.fromNumber(12480000))).toBe(12480000n);
    expect(integerToBigInt(12480000)).toBe(12480000n);
  });
  it("formats values above Number.MAX_SAFE_INTEGER without precision loss", () => expect(formatPKR(900719925474099312n)).toBe("PKR 9,007,199,254,740,993.12"));
  it("normalizes and formats quantities without Number", () => {
    expect(quantityToMilli("60.125")).toBe(60125n);
    expect(formatMilli(60125n)).toBe("60.125");
  });
  it("calculates 60 L × PKR 180", () => expect(multiplyQuantityRate(60000n, 18000n)).toBe(1080000n));
  it("matches shop closing scenario", () => {
    const result = cashClosing({ opening: 0n, gross: 5000000n, credit: 800000n, digital: 200000n, collections: 0n, inflows: 0n, vendorPayments: 0n, expenses: 300000n, outflows: 0n, counted: 3700000n });
    expect(result).toEqual({ cashSales: 4000000n, expected: 3700000n, variance: 0n });
  });
  it("reconciles milk", () => expect(milkReconciliation({ opening: 20000n, purchased: 60000n, returns: 0n, shopSales: 10000n, deliveries: 20000n, production: 15000n, waste: 1000n, other: 0n, physical: 34000n })).toEqual({ expected: 34000n, variance: 0n }));
});
