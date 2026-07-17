import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";
import { inventoryReceiptLine,isEligibleManualReceiptProduct,isManualReceiptSku,MANUAL_RECEIPT_SKUS,movingWeightedAverage } from "./inventory-calculations";
import { isDailyDeliveryProduct } from "./product-eligibility";

const eligible=(sku:string)=>({sku,active:true,inventoryManaged:true,allowManualStockReceipt:true,internalOnly:false});
describe("inventory receiving business rules",()=>{
  it("keeps the manual receiving allow-list exact",()=>expect([...MANUAL_RECEIPT_SKUS]).toEqual(["YOG-001","BREAD-001","EGG-001","ISPAGHOL-001"]));
  it.each(["YOG-001","BREAD-001","EGG-001","ISPAGHOL-001"])("allows %s when product flags are eligible",sku=>expect(isEligibleManualReceiptProduct(eligible(sku))).toBe(true));
  it.each(["MILK-001","KUNDA-001","GL-001"])("rejects %s from normal manual receiving",sku=>{expect(isManualReceiptSku(sku)).toBe(false);expect(isEligibleManualReceiptProduct(eligible(sku))).toBe(false)});
  it("rejects inactive, internal and unmanaged products",()=>{expect(isEligibleManualReceiptProduct({...eligible("YOG-001"),active:false})).toBe(false);expect(isEligibleManualReceiptProduct({...eligible("YOG-001"),internalOnly:true})).toBe(false);expect(isEligibleManualReceiptProduct({...eligible("YOG-001"),inventoryManaged:false})).toBe(false)});
  it("calculates moving weighted-average cost using integer quantities and paisa",()=>expect(movingWeightedAverage(10000n,10000n,5000n,20000n)).toBe(13333n));
  it("keeps buying cost separate from selling rate",()=>expect(inventoryReceiptLine(5000n,20000n,10000n,10000n)).toEqual({linePurchaseTotalPaisa:100000n,resultingStockMilli:15000n,resultingAverageCostPaisa:13333n}));
  it("uses the same eligibility flags for daily delivery",()=>{expect(isDailyDeliveryProduct({sku:"YOG-001",active:true,sellable:true,inventoryManaged:true,availableInDailyDelivery:true,internalOnly:false,stockMilli:1000,retailRatePaisa:20000})).toBe(true);expect(isDailyDeliveryProduct({sku:"YOG-001",active:true,sellable:true,inventoryManaged:true,availableInDailyDelivery:true,internalOnly:false,stockMilli:0,retailRatePaisa:20000})).toBe(false)});
  it("keeps vendor procurement as the Fresh Milk stock source",()=>{const source=readFileSync(resolve("src/lib/services/procurement.ts"),"utf8");expect(source).toContain('sku: "MILK-001"');expect(source).toContain("averageCostPaisa")});
  it("protects receipt posting with transactions and idempotency",()=>{const source=readFileSync(resolve("src/lib/services/inventory-receipt.ts"),"utf8");expect(source).toContain("return transaction");expect(source).toContain('operation:"inventory_receipt"');expect(source).toContain("idempotencyKey")});
  it("creates rate history without rewriting historical deliveries",()=>{const receipt=readFileSync(resolve("src/lib/services/inventory-receipt.ts"),"utf8"),delivery=readFileSync(resolve("src/lib/services/delivery.ts"),"utf8");expect(receipt).toContain("product_rate_history");expect(delivery).toContain("unitSaleRatePaisa");expect(delivery).toContain("unitCostPaisa")});
  it("records COGS, revenue and gross profit on outbound movements",()=>{const source=readFileSync(resolve("src/lib/services/delivery.ts"),"utf8");for(const field of ["costOfGoodsSoldPaisa","revenuePaisa","grossProfitPaisa"])expect(source).toContain(field)});
  it("prevents negative delivery stock with an atomic stock guard",()=>{const source=readFileSync(resolve("src/lib/services/delivery.ts"),"utf8");expect(source).toContain('stockMilli: { $gte: Long.fromBigInt(required) }');expect(source).toContain("Not enough")});
  it("posts paid outflow only when money was actually paid",()=>{const source=readFileSync(resolve("src/lib/services/inventory-receipt.ts"),"utf8");expect(source).toContain("if(paidAmount>0n)");expect(source).toContain('direction:"out"');expect(source).toContain('paymentStatus==="unpaid"')});
  it("keeps excluded internal records out of inventory and delivery screens",()=>{const inventory=readFileSync(resolve("src/app/(app)/inventory/page.tsx"),"utf8"),delivery=readFileSync(resolve("src/app/(app)/deliveries/page.tsx"),"utf8");expect(inventory).not.toContain('"KUNDA-001"');expect(delivery).toContain("DAILY_DELIVERY_PRODUCT_FILTER")});
  it("requires safe reversal when stock or price changed after receipt",()=>{const source=readFileSync(resolve("src/lib/services/inventory-receipt.ts"),"utf8");expect(source).toContain("stock or selling price changed after this receipt");expect(source).toContain("inventory-receipt-reversal")});
});
