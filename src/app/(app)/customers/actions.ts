"use server";
import { Long } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { quantityToMilli, rupeesToPaisa } from "@/lib/money";
import { paymentSchema, postPayment } from "@/lib/services/payment";

export type ActionState={error?:string;success?:string};
const customerSchema=z.object({name:z.string().trim().min(2),phone:z.string().trim().min(7).max(20),whatsapp:z.string().trim().max(20).optional(),address:z.string().trim().min(2),customerType:z.enum(["household","shop","party"]),dailyQuantity:z.string(),deliveryDays:z.string().default("1,2,3,4,5,6,7"),startDate:z.iso.date(),paused:z.string().optional(),milkRate:z.string().optional(),deliverySequence:z.string().optional(),openingBalance:z.string().default("0"),notes:z.string().trim().max(500).optional()});

export async function createCustomer(_:ActionState,data:FormData):Promise<ActionState>{
  const actor=await requireSession(["owner","manager","accountant"]); const parsed=customerSchema.safeParse(Object.fromEntries(data));
  if(!parsed.success)return{error:parsed.error.issues[0]?.message??"Check the customer details."};
  try{
    const opening=rupeesToPaisa(parsed.data.openingBalance),quantity=quantityToMilli(parsed.data.dailyQuantity),rate=parsed.data.milkRate?.trim()?rupeesToPaisa(parsed.data.milkRate):null;
    const days=parsed.data.deliveryDays.split(",").map(Number).filter(day=>Number.isInteger(day)&&day>=1&&day<=7); if(!days.length)return{error:"Select at least one delivery day."};
    await transaction(async(database,session)=>{const now=new Date(),sequence=await database.collection("counters").findOneAndUpdate({_id:"customer" as never},{$inc:{value:1}},{upsert:true,returnDocument:"after",session});const code=`C-${String(sequence?.value??1).padStart(4,"0")}`;const result=await database.collection("customers").insertOne({code,name:parsed.data.name,phone:parsed.data.phone,whatsapp:parsed.data.whatsapp||parsed.data.phone,address:parsed.data.address,customerType:parsed.data.customerType,defaultQuantityMilli:Long.fromBigInt(quantity),deliveryDays:days,startDate:parsed.data.startDate,paused:parsed.data.paused==="on",deliverySequence:parsed.data.deliverySequence?Number(parsed.data.deliverySequence):null,openingBalancePaisa:Long.fromBigInt(opening),notes:parsed.data.notes||null,active:true,createdAt:now,createdBy:actor.userId,updatedAt:now,updatedBy:actor.userId},{session});
      if(rate!==null)await database.collection("customer_rate_history").insertOne({customerId:result.insertedId,ratePaisa:Long.fromBigInt(rate),effectiveFrom:new Date(`${parsed.data.startDate}T00:00:00Z`),effectiveTo:null,reason:"Initial customer rate",createdAt:now,createdBy:actor.userId},{session});
      if(opening!==0n)await database.collection("party_ledger_entries").insertOne({transactionNo:`OPEN-C-${result.insertedId}`,lineNo:1,partyType:"customer",partyId:result.insertedId,businessDate:parsed.data.startDate,date:now,debitPaisa:opening>0n?Long.fromBigInt(opening):Long.ZERO,creditPaisa:opening<0n?Long.fromBigInt(-opening):Long.ZERO,description:"Opening balance",status:"posted",createdAt:now,createdBy:actor.userId},{session});
      await database.collection("audit_logs").insertOne({actorId:actor.userId,action:"create",entity:"customer",entityId:result.insertedId,createdAt:now},{session});
    }); revalidatePath("/customers");revalidatePath("/deliveries");return{success:"Customer added and ready for delivery."};
  }catch(error){return{error:error&&typeof error==="object"&&"code" in error&&error.code===11000?"Customer code already exists.":"Customer could not be saved."};}
}

export async function recordCustomerPayment(_:ActionState,data:FormData):Promise<ActionState>{const actor=await requireSession(["owner","manager","accountant","cashier"]);const parsed=paymentSchema.safeParse(Object.fromEntries(data));if(!parsed.success)return{error:"Check the payment amount and method."};try{const result=await postPayment(parsed.data,actor.userId);revalidatePath("/customers");revalidatePath("/cashbook");return{success:`Receipt ${result.transactionNo}`};}catch(error){return{error:error instanceof Error?error.message:"Payment could not be recorded."};}}
