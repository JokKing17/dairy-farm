import { Long } from "mongodb";
import { z } from "zod";
import { transaction } from "../db";
import { transactionNo } from "../ids";
import { movingWeightedAverage } from "../inventory-calculations";
import { integerToBigInt, quantityToMilli, rupeesToPaisa } from "../money";
import { calculateYogurtProduction } from "../yogurt-production-calculations";

const money=z.string().max(20).default("0");
const kundaSchema=z.object({size:z.enum(["3","3.5","custom"]),customSize:z.string().max(20).optional(),count:z.coerce.number().int().min(0).max(10000),notes:z.string().trim().max(200).optional()});
export const yogurtProductionSchema=z.object({
  businessDate:z.iso.date(),idempotencyKey:z.uuid(),milkUsed:z.string().max(20),sellingPrice:z.string().max(20),
  kundas:z.array(kundaSchema).max(20).default([]),looseYogurt:z.string().max(20).default("0"),
  costs:z.object({starter:money,gas:money,electricity:money,labour:money,packaging:money,other:money}),
  processingPaymentMethod:z.enum(["cash","bank","easypaisa","jazzcash"]).optional(),
  notes:z.string().trim().max(500).optional(),
});
export type YogurtProductionInput=z.infer<typeof yogurtProductionSchema>;
const duplicate=(error:unknown)=>Boolean(error&&typeof error==="object"&&"code" in error&&error.code===11000);

function parsedKundas(input:YogurtProductionInput){
  return input.kundas.filter(entry=>entry.count>0).map(entry=>{
    const sizeMilliKg=quantityToMilli(entry.size==="custom"?(entry.customSize??""):entry.size);
    return{sizeMilliKg,numberOfKundas:entry.count,totalWeightMilliKg:sizeMilliKg*BigInt(entry.count),notes:entry.notes||null,sizeType:entry.size};
  });
}

export async function postYogurtProduction(raw:YogurtProductionInput,actorId:string){
  const input=yogurtProductionSchema.parse(raw);
  return transaction(async(database,session)=>{
    const previous=await database.collection("idempotency_records").findOne({key:input.idempotencyKey},{session});
    if(previous)return previous.result as {transactionNo:string;milkUsedMilli:string;yogurtOutputMilli:string;yogurtUnitCostPaisa:string;estimatedGrossProfitPaisa:string};
    const settings=await database.collection("business_settings").findOne({_id:"default" as never},{session});
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:String(settings?.timezone??"Asia/Karachi"),year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const difference=Math.round((new Date(`${today}T00:00:00Z`).getTime()-new Date(`${input.businessDate}T00:00:00Z`).getTime())/86_400_000);
    const allowed=Number(settings?.allowedBackdateDays??3);
    if(difference<0)throw new Error("Future Yogurt production is not allowed.");
    if(difference>allowed)throw new Error(`Yogurt production can only be backdated ${allowed} days.`);
    const [milk,yogurt]=await Promise.all([
      database.collection("products").findOne({sku:"MILK-001",active:true,inventoryManaged:true,stockSource:"vendor-procurement"},{session}),
      database.collection("products").findOne({sku:"YOG-001",active:true,inventoryManaged:true,stockSource:"yogurt-production"},{session}),
    ]);
    if(!milk||!yogurt)throw new Error("Fresh Milk or Yogurt product setup is incomplete. Run the migration.");
    const milkUsedMilli=quantityToMilli(input.milkUsed),looseYogurtMilli=quantityToMilli(input.looseYogurt),sellingRatePaisa=rupeesToPaisa(input.sellingPrice);
    const kundas=parsedKundas(input),additionalCosts={
      starterPaisa:rupeesToPaisa(input.costs.starter),gasPaisa:rupeesToPaisa(input.costs.gas),electricityPaisa:rupeesToPaisa(input.costs.electricity),
      labourPaisa:rupeesToPaisa(input.costs.labour),packagingPaisa:rupeesToPaisa(input.costs.packaging),otherPaisa:rupeesToPaisa(input.costs.other),
    };
    const milkStock=integerToBigInt(milk.stockMilli),milkCost=integerToBigInt(milk.averageCostPaisa);
    if(milkStock<milkUsedMilli)throw new Error(`Not enough Fresh Milk. Available: ${(milkStock/1000n).toString()} liters.`);
    const calculated=calculateYogurtProduction({milkUsedMilli,milkAverageCostPaisa:milkCost,kundaEntries:kundas,looseYogurtMilli,additionalCostsPaisa:Object.values(additionalCosts),sellingRatePaisa});
    const yogurtStock=integerToBigInt(yogurt.stockMilli),previousYogurtCost=integerToBigInt(yogurt.averageCostPaisa),previousSellingRate=integerToBigInt(yogurt.retailRatePaisa);
    const resultingYogurtStock=yogurtStock+calculated.actualOutputMilli;
    const resultingYogurtCost=movingWeightedAverage(yogurtStock,previousYogurtCost,calculated.actualOutputMilli,calculated.yogurtUnitCostPaisa);
    const now=new Date(),number=transactionNo("YOG");
    const milkUpdate=await database.collection("products").updateOne({_id:milk._id,stockMilli:milk.stockMilli,stockSource:"vendor-procurement"},{$inc:{stockMilli:Long.fromBigInt(-milkUsedMilli)},$set:{updatedAt:now,updatedBy:actorId}},{session});
    if(!milkUpdate.modifiedCount)throw new Error("Fresh Milk stock changed while saving. Review and try again.");
    const yogurtUpdate=await database.collection("products").updateOne({_id:yogurt._id,stockMilli:yogurt.stockMilli,averageCostPaisa:yogurt.averageCostPaisa},{$set:{stockMilli:Long.fromBigInt(resultingYogurtStock),averageCostPaisa:Long.fromBigInt(resultingYogurtCost),retailRatePaisa:Long.fromBigInt(sellingRatePaisa),lastProductionAt:now,updatedAt:now,updatedBy:actorId}},{session});
    if(!yogurtUpdate.modifiedCount)throw new Error("Yogurt stock changed while saving. Review and try again.");
    const rateChanged=sellingRatePaisa!==previousSellingRate;
    if(rateChanged){
      const effectiveFrom=new Date(`${input.businessDate}T00:00:00Z`);
      await database.collection("product_rate_history").updateMany({productId:yogurt._id,effectiveTo:null,effectiveFrom:{$lt:effectiveFrom}},{$set:{effectiveTo:effectiveFrom,updatedAt:now,updatedBy:actorId}},{session});
      await database.collection("product_rate_history").insertOne({productId:yogurt._id,productSku:"YOG-001",previousRatePaisa:Long.fromBigInt(previousSellingRate),ratePaisa:Long.fromBigInt(sellingRatePaisa),effectiveFrom,effectiveTo:null,businessDate:input.businessDate,source:"yogurt_production",sourceTransactionNo:number,createdAt:now,createdBy:actorId},{session});
    }
    const storedKundas=kundas.map(entry=>({...entry,sizeMilliKg:Long.fromBigInt(entry.sizeMilliKg),totalWeightMilliKg:Long.fromBigInt(entry.totalWeightMilliKg)}));
    await database.collection("production_batches").insertOne({
      transactionNo:number,businessDate:input.businessDate,milkProductSku:"MILK-001",milkUsedMilli:Long.fromBigInt(milkUsedMilli),milkUnitCostPaisa:Long.fromBigInt(milkCost),
      milkMaterialCostPaisa:Long.fromBigInt(calculated.milkMaterialCostPaisa),previousMilkStockMilli:milk.stockMilli,resultingMilkStockMilli:Long.fromBigInt(milkStock-milkUsedMilli),
      yogurtProductSku:"YOG-001",kundaEntries:storedKundas,looseYogurtMilli:Long.fromBigInt(looseYogurtMilli),actualOutputMilli:Long.fromBigInt(calculated.actualOutputMilli),
      additionalCosts:Object.fromEntries(Object.entries(additionalCosts).map(([key,value])=>[key,Long.fromBigInt(value)])),additionalCostPaisa:Long.fromBigInt(calculated.additionalCostPaisa),
      totalProductionCostPaisa:Long.fromBigInt(calculated.totalProductionCostPaisa),yogurtUnitCostPaisa:Long.fromBigInt(calculated.yogurtUnitCostPaisa),
      yogurtSellingRatePaisa:Long.fromBigInt(sellingRatePaisa),estimatedRevenuePaisa:Long.fromBigInt(calculated.estimatedRevenuePaisa),estimatedGrossProfitPaisa:Long.fromBigInt(calculated.estimatedGrossProfitPaisa),
      yieldMilli:Long.fromBigInt(calculated.yieldMilli),previousYogurtStockMilli:yogurt.stockMilli,resultingYogurtStockMilli:Long.fromBigInt(resultingYogurtStock),
      previousYogurtAverageCostPaisa:yogurt.averageCostPaisa,resultingYogurtAverageCostPaisa:Long.fromBigInt(resultingYogurtCost),previousYogurtSellingRatePaisa:yogurt.retailRatePaisa,
      processingPaymentMethod:input.processingPaymentMethod??null,status:"posted",idempotencyKey:input.idempotencyKey,notes:input.notes||null,createdBy:actorId,createdAt:now,updatedBy:actorId,updatedAt:now,
    },{session});
    await database.collection("inventory_movements").insertMany([
      {transactionNo:number,lineNo:1,productId:milk._id,productSku:"MILK-001",quantityMilli:Long.fromBigInt(-milkUsedMilli),unitCostPaisa:Long.fromBigInt(milkCost),materialCostPaisa:Long.fromBigInt(calculated.milkMaterialCostPaisa),businessDate:input.businessDate,location:"main-shop",sourceTransactionNo:number,type:"yogurt-production-consumption",status:"posted",createdBy:actorId,createdAt:now},
      {transactionNo:number,lineNo:2,productId:yogurt._id,productSku:"YOG-001",quantityMilli:Long.fromBigInt(calculated.actualOutputMilli),unitCostPaisa:Long.fromBigInt(calculated.yogurtUnitCostPaisa),totalProductionCostPaisa:Long.fromBigInt(calculated.totalProductionCostPaisa),resultingAverageCostPaisa:Long.fromBigInt(resultingYogurtCost),businessDate:input.businessDate,location:"main-shop",sourceTransactionNo:number,type:"yogurt-production-output",status:"posted",createdBy:actorId,createdAt:now},
    ],{session});
    await database.collection("financial_transactions").insertOne({transactionNo:number,kind:"yogurt_production",amountPaisa:Long.fromBigInt(calculated.totalProductionCostPaisa),materialCostPaisa:Long.fromBigInt(calculated.milkMaterialCostPaisa),processingCostPaisa:Long.fromBigInt(calculated.additionalCostPaisa),businessDate:input.businessDate,status:"posted",createdAt:now,createdBy:actorId},{session});
    if(input.processingPaymentMethod&&calculated.additionalCostPaisa>0n)await database.collection("cashbook_entries").insertOne({transactionNo:number,lineNo:1,businessDate:input.businessDate,account:input.processingPaymentMethod,direction:"out",amountPaisa:Long.fromBigInt(calculated.additionalCostPaisa),description:`Yogurt processing costs ${number}`,sourceType:"yogurt_production",status:"posted",createdAt:now,createdBy:actorId},{session});
    await database.collection("audit_logs").insertOne({actorId,action:"post",entity:"yogurt_production",entityId:number,metadata:{milkUsedMilli:milkUsedMilli.toString(),yogurtOutputMilli:calculated.actualOutputMilli.toString(),kundaCount:kundas.reduce((sum,entry)=>sum+entry.numberOfKundas,0)},createdAt:now},{session});
    const result={transactionNo:number,milkUsedMilli:milkUsedMilli.toString(),yogurtOutputMilli:calculated.actualOutputMilli.toString(),yogurtUnitCostPaisa:calculated.yogurtUnitCostPaisa.toString(),estimatedGrossProfitPaisa:calculated.estimatedGrossProfitPaisa.toString()};
    await database.collection("idempotency_records").insertOne({key:input.idempotencyKey,operation:"yogurt_production",result,createdAt:now},{session});
    return result;
  }).catch(error=>{if(duplicate(error))throw new Error("This Yogurt batch was already saved. Refresh to see it in history.");throw error});
}

export async function reverseYogurtProduction(transactionNumber:string,reason:string,actorId:string){
  if(reason.trim().length<5)throw new Error("Enter a clear reversal reason.");
  return transaction(async(database,session)=>{
    const batch=await database.collection("production_batches").findOne({transactionNo:transactionNumber,status:"posted",yogurtProductSku:"YOG-001"},{session});
    if(!batch)throw new Error("This Yogurt batch is missing or already reversed.");
    const [milk,yogurt]=await Promise.all([database.collection("products").findOne({sku:"MILK-001"},{session}),database.collection("products").findOne({sku:"YOG-001"},{session})]);
    if(!milk||!yogurt||integerToBigInt(yogurt.stockMilli)!==integerToBigInt(batch.resultingYogurtStockMilli)||integerToBigInt(yogurt.averageCostPaisa)!==integerToBigInt(batch.resultingYogurtAverageCostPaisa)||integerToBigInt(yogurt.retailRatePaisa)!==integerToBigInt(batch.yogurtSellingRatePaisa))throw new Error("Yogurt from this batch has been sold or stock/cost changed. It cannot be reversed safely.");
    const now=new Date(),number=transactionNo("REV-YOG"),milkUsed=integerToBigInt(batch.milkUsedMilli),output=integerToBigInt(batch.actualOutputMilli);
    await database.collection("products").updateOne({_id:milk._id,stockMilli:milk.stockMilli},{$inc:{stockMilli:Long.fromBigInt(milkUsed)},$set:{updatedAt:now,updatedBy:actorId}},{session});
    await database.collection("products").updateOne({_id:yogurt._id,stockMilli:yogurt.stockMilli,averageCostPaisa:yogurt.averageCostPaisa},{$set:{stockMilli:batch.previousYogurtStockMilli,averageCostPaisa:batch.previousYogurtAverageCostPaisa,retailRatePaisa:batch.previousYogurtSellingRatePaisa,updatedAt:now,updatedBy:actorId}},{session});
    if(integerToBigInt(batch.yogurtSellingRatePaisa)!==integerToBigInt(batch.previousYogurtSellingRatePaisa)){await database.collection("product_rate_history").updateMany({productId:yogurt._id,effectiveTo:null},{$set:{effectiveTo:now,updatedAt:now,updatedBy:actorId}},{session});await database.collection("product_rate_history").insertOne({productId:yogurt._id,productSku:"YOG-001",previousRatePaisa:batch.yogurtSellingRatePaisa,ratePaisa:batch.previousYogurtSellingRatePaisa,effectiveFrom:now,effectiveTo:null,businessDate:batch.businessDate,source:"yogurt_production_reversal",sourceTransactionNo:number,createdAt:now,createdBy:actorId},{session});}
    await database.collection("inventory_movements").insertMany([
      {transactionNo:number,lineNo:1,productSku:"MILK-001",quantityMilli:Long.fromBigInt(milkUsed),unitCostPaisa:batch.milkUnitCostPaisa,businessDate:batch.businessDate,location:"main-shop",sourceTransactionNo:transactionNumber,type:"yogurt-production-reversal",status:"posted",createdBy:actorId,createdAt:now},
      {transactionNo:number,lineNo:2,productSku:"YOG-001",quantityMilli:Long.fromBigInt(-output),unitCostPaisa:batch.yogurtUnitCostPaisa,businessDate:batch.businessDate,location:"main-shop",sourceTransactionNo:transactionNumber,type:"yogurt-production-reversal",status:"posted",createdBy:actorId,createdAt:now},
    ],{session});
    if(batch.processingPaymentMethod&&integerToBigInt(batch.additionalCostPaisa)>0n)await database.collection("cashbook_entries").insertOne({transactionNo:number,lineNo:1,businessDate:batch.businessDate,account:batch.processingPaymentMethod,direction:"in",amountPaisa:batch.additionalCostPaisa,description:`Reversal of ${transactionNumber}`,sourceType:"yogurt_production_reversal",status:"posted",createdAt:now,createdBy:actorId},{session});
    await database.collection("financial_transactions").insertOne({transactionNo:number,kind:"yogurt_production_reversal",amountPaisa:Long.fromBigInt(-integerToBigInt(batch.totalProductionCostPaisa)),reversesTransactionNo:transactionNumber,businessDate:batch.businessDate,status:"posted",createdAt:now,createdBy:actorId},{session});
    await database.collection("production_batches").updateOne({_id:batch._id,status:"posted"},{$set:{status:"reversed",reversedBy:actorId,reversedAt:now,reversalReason:reason.trim(),reversalTransactionNo:number,updatedBy:actorId,updatedAt:now}},{session});
    await database.collection("audit_logs").insertOne({actorId,action:"reverse",entity:"yogurt_production",entityId:batch._id,metadata:{transactionNumber,reversalNo:number,reason:reason.trim()},createdAt:now},{session});
    return{reversalNo:number};
  });
}
