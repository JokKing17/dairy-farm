export type Paisa = bigint;

export function rupeesToPaisa(value: string | number): Paisa {
  const normalized = String(value).replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("Invalid money amount");
  const negative = normalized.startsWith("-");
  const [whole, decimal = ""] = normalized.replace("-", "").split(".");
  const result = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
  return negative ? -result : result;
}

export function formatPKR(value: Paisa | number | string): string {
  const paisa = BigInt(value);
  const negative = paisa < 0n;
  const absolute = negative ? -paisa : paisa;
  const rupees = absolute / 100n;
  const decimals = (absolute % 100n).toString().padStart(2, "0");
  const grouped = rupees.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}PKR ${grouped}.${decimals}`;
}

export function quantityToMilli(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) throw new Error("Invalid quantity");
  const [whole, decimal = ""] = normalized.split(".");
  return BigInt(whole) * 1000n + BigInt(decimal.padEnd(3, "0"));
}

export function formatMilli(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 1000n;
  const fraction = (absolute % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export const multiplyQuantityRate = (quantityMilli: bigint, ratePaisaPerUnit: bigint): bigint =>
  (quantityMilli * ratePaisaPerUnit + 500n) / 1000n;

export function cashClosing(input: { opening: bigint; gross: bigint; credit: bigint; digital: bigint; collections: bigint; inflows: bigint; vendorPayments: bigint; expenses: bigint; outflows: bigint; counted: bigint }) {
  const cashSales = input.gross - input.credit - input.digital;
  const expected = input.opening + cashSales + input.collections + input.inflows - input.vendorPayments - input.expenses - input.outflows;
  return { cashSales, expected, variance: input.counted - expected };
}

export function milkReconciliation(input: { opening: bigint; purchased: bigint; returns: bigint; shopSales: bigint; deliveries: bigint; production: bigint; waste: bigint; other: bigint; physical: bigint }) {
  const expected = input.opening + input.purchased + input.returns - input.shopSales - input.deliveries - input.production - input.waste - input.other;
  return { expected, variance: input.physical - expected };
}
