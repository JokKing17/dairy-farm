import type { Document, Filter } from "mongodb";
import { integerToBigInt } from "./money";
export const DAILY_DELIVERY_CATALOG_SKUS=["YOG-001","BREAD-001","EGG-001","ISPAGHOL-001"] as const;
export const DAILY_DELIVERY_CATALOG_FILTER:Filter<Document>={sku:{$in:[...DAILY_DELIVERY_CATALOG_SKUS]},active:true,sellable:true,inventoryManaged:true,availableInDailyDelivery:true,internalOnly:{$ne:true}};
export function isDailyDeliveryCatalogProduct(product:Document|undefined):product is Document{
  return Boolean(product&&DAILY_DELIVERY_CATALOG_SKUS.includes(String(product.sku) as typeof DAILY_DELIVERY_CATALOG_SKUS[number])&&product.active===true&&product.sellable===true&&product.inventoryManaged===true&&product.availableInDailyDelivery===true&&product.internalOnly!==true);
}
export function isDailyDeliveryProduct(product:Document|undefined):product is Document{
  if(!isDailyDeliveryCatalogProduct(product)||integerToBigInt(product.stockMilli)<=0n||integerToBigInt(product.retailRatePaisa)<=0n)return false;
  return product.sku==="YOG-001"?product.stockSource==="yogurt-production":product.stockSource==="inventory-receipt";
}
