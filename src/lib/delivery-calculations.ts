import { multiplyQuantityRate, quantityToMilli } from "./money";

export type PricedItem = { sku: string; quantity: string; ratePaisa: bigint };

export function calculateDeliveryCharge(input: {
  deliveryStatus: "delivered" | "changed" | "extra" | "skipped" | "paused";
  milkQuantity: string;
  milkRatePaisa: bigint;
  products: PricedItem[];
}) {
  if (input.deliveryStatus === "skipped" || input.deliveryStatus === "paused") return { milkQuantityMilli: 0n, milkAmountPaisa: 0n, otherAmountPaisa: 0n, totalAmountPaisa: 0n };
  const milkQuantityMilli = quantityToMilli(input.milkQuantity || "0");
  const milkAmountPaisa = multiplyQuantityRate(milkQuantityMilli, input.milkRatePaisa);
  const otherAmountPaisa = input.products.reduce((total, item) => {
    const quantity = item.quantity.trim() ? quantityToMilli(item.quantity) : 0n;
    return total + multiplyQuantityRate(quantity, item.ratePaisa);
  }, 0n);
  return { milkQuantityMilli, milkAmountPaisa, otherAmountPaisa, totalAmountPaisa: milkAmountPaisa + otherAmountPaisa };
}
