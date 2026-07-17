import type { Document, Filter } from "mongodb";
import { integerToBigInt } from "./money";
export const DAILY_DELIVERY_PRODUCT_FILTER:Filter<Document>={active:true,sellable:true,inventoryManaged:true,availableInDailyDelivery:true,internalOnly:{$ne:true},stockMilli:{$gt:0},retailRatePaisa:{$gt:0}};
export function isDailyDeliveryProduct(product:Document|undefined):product is Document{return Boolean(product&&product.active===true&&product.sellable===true&&product.inventoryManaged===true&&product.availableInDailyDelivery===true&&product.internalOnly!==true&&integerToBigInt(product.stockMilli)>0n&&integerToBigInt(product.retailRatePaisa)>0n)}
