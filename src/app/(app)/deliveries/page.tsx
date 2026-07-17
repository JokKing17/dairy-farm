import { db } from "@/lib/db";
import { formatMilli, integerToBigInt } from "@/lib/money";
import { karachiBusinessDate } from "@/lib/queries";
import { DeliverySheet } from "./delivery-sheet";
export const dynamic="force-dynamic";

export default async function DailyDeliveriesPage(){
  const database=await db(),now=new Date(),businessDate=karachiBusinessDate();
  const [customers,settings,products,existingBatch]=await Promise.all([
    database.collection("customers").aggregate([{$match:{active:true,customerType:"household"}},{$lookup:{from:"customer_rate_history",let:{customer:"$_id"},pipeline:[{$match:{$expr:{$eq:["$customerId","$$customer"]},effectiveFrom:{$lte:now},$or:[{effectiveTo:null},{effectiveTo:{$gt:now}}]}},{$sort:{effectiveFrom:-1}},{$limit:1}],as:"effectiveRate"}},{$sort:{deliverySequence:1,name:1}}]).toArray(),
    database.collection("business_settings").findOne({_id:"default" as never}),
    database.collection("products").find({active:true,sku:{$in:["YOG-001","KUNDA-001","BREAD-001","EGG-001","GL-001"]}}).sort({name:1}).toArray(),
    database.collection("delivery_batches").findOne({businessDate,status:"posted"}),
  ]);
  const defaultRate=integerToBigInt(settings?.customerRatePaisa);
  const customerRows=customers.map(customer=>({id:customer._id.toString(),code:String(customer.code),name:String(customer.name),address:String(customer.address??""),normalQuantity:formatMilli(integerToBigInt(customer.defaultQuantityMilli)),ratePaisa:integerToBigInt(customer.effectiveRate?.[0]?.ratePaisa??customer.milkRatePaisa,defaultRate).toString(),paused:Boolean(customer.paused)}));
  const productRows=products.map(product=>({sku:String(product.sku),name:String(product.name),unit:String(product.unit),ratePaisa:integerToBigInt(product.retailRatePaisa).toString()}));
  return <div className="content"><div className="title">Daily Deliveries</div><div className="subtitle">One simple household list for today. Normal milk quantities are pre-filled.</div>{existingBatch?<div className="card table-card form-success"><b>Today was already posted as {String(existingBatch.transactionNo)}</b><span>Duplicate delivery charges are blocked.</span></div>:customerRows.length?<DeliverySheet customers={customerRows} products={productRows} today={businessDate}/>:<div className="card table-card empty-state"><b>No active household customers</b><span>Add household customers before posting daily deliveries.</span></div>}</div>;
}
