import { ObjectId } from "mongodb";
import { db } from "./db";
import { calculateStatementTotals, formatCustomerStatementMessage, monthBounds } from "./customer-statement-calculations";
export { normalizePakistanPhone } from "./customer-statement-calculations";

export async function getCustomerStatement(customerId: string, month: string) {
  if (!ObjectId.isValid(customerId)) throw new Error("Customer not found");
  const { start, next } = monthBounds(month); const database=await db(); const id=new ObjectId(customerId);
  const [customer,previous,current,allBalance,deliveries,productRows]=await Promise.all([
    database.collection("customers").findOne({_id:id}),
    database.collection("party_ledger_entries").aggregate([{$match:{partyType:"customer",partyId:id,status:"posted",$or:[{businessDate:{$lt:start}},{description:"Opening balance"}]}},{$group:{_id:null,debit:{$sum:"$debitPaisa"},credit:{$sum:"$creditPaisa"}}}]).next(),
    database.collection("party_ledger_entries").aggregate([{$match:{partyType:"customer",partyId:id,status:"posted",description:{$ne:"Opening balance"},businessDate:{$gte:start,$lt:next}}},{$group:{_id:null,debit:{$sum:"$debitPaisa"},credit:{$sum:"$creditPaisa"}}}]).next(),
    database.collection("party_ledger_entries").aggregate([{$match:{partyType:"customer",partyId:id,status:"posted"}},{$group:{_id:null,debit:{$sum:"$debitPaisa"},credit:{$sum:"$creditPaisa"}}}]).next(),
    database.collection("customer_deliveries").find({customerId:id,status:"posted",businessDate:{$gte:start,$lt:next}}).sort({businessDate:1}).toArray(),
    database.collection("customer_deliveries").aggregate([{$match:{customerId:id,status:"posted",businessDate:{$gte:start,$lt:next}}},{$unwind:"$otherProducts"},{$group:{_id:"$otherProducts.sku",quantity:{$sum:"$otherProducts.quantityMilli"},amount:{$sum:"$otherProducts.amountPaisa"}}},{$sort:{_id:1}}]).toArray(),
  ]);
  if(!customer)throw new Error("Customer not found");
  const {previousBalance,currentCharges,payments,remainingBalance,milkQuantity,milkCharges,otherProductCharges}=calculateStatementTotals({previousDebit:previous?.debit,previousCredit:previous?.credit,currentDebit:current?.debit,currentCredit:current?.credit,allDebit:allBalance?.debit,allCredit:allBalance?.credit,deliveries});
  return {customer,month,start,next,previousBalance,currentCharges,payments,remainingBalance,milkQuantity,milkCharges,otherProductCharges,deliveries,productRows};
}

export function customerStatementMessage(statement: Awaited<ReturnType<typeof getCustomerStatement>>) {
  return formatCustomerStatementMessage({customerName:String(statement.customer.name),month:statement.month,milkQuantity:statement.milkQuantity,milkCharges:statement.milkCharges,otherProductCharges:statement.otherProductCharges,previousBalance:statement.previousBalance,payments:statement.payments,remainingBalance:statement.remainingBalance});
}
