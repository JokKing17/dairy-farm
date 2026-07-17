import { multiplyQuantityRate } from "./money";

export function movingWeightedAverage(existingStockMilli:bigint,existingCostPaisa:bigint,receivedQuantityMilli:bigint,receivedCostPaisa:bigint){
  if(existingStockMilli<0n||receivedQuantityMilli<=0n||existingCostPaisa<0n||receivedCostPaisa<=0n)throw new Error("Invalid inventory values");
  const resultingStockMilli=existingStockMilli+receivedQuantityMilli;
  return (existingStockMilli*existingCostPaisa+receivedQuantityMilli*receivedCostPaisa)/resultingStockMilli;
}
export function inventoryReceiptLine(quantityMilli:bigint,buyingPricePaisa:bigint,existingStockMilli:bigint,existingAverageCostPaisa:bigint){
  const resultingStockMilli=existingStockMilli+quantityMilli;
  return {linePurchaseTotalPaisa:multiplyQuantityRate(quantityMilli,buyingPricePaisa),resultingStockMilli,resultingAverageCostPaisa:movingWeightedAverage(existingStockMilli,existingAverageCostPaisa,quantityMilli,buyingPricePaisa)};
}
export const MANUAL_RECEIPT_SKUS=["YOG-001","BREAD-001","EGG-001","ISPAGHOL-001"] as const;
export function isManualReceiptSku(sku:string):sku is typeof MANUAL_RECEIPT_SKUS[number]{return (MANUAL_RECEIPT_SKUS as readonly string[]).includes(sku)}
export function isEligibleManualReceiptProduct(product:{sku:string;active?:boolean;inventoryManaged?:boolean;allowManualStockReceipt?:boolean;internalOnly?:boolean}){return isManualReceiptSku(product.sku)&&product.active===true&&product.inventoryManaged===true&&product.allowManualStockReceipt===true&&product.internalOnly!==true}
