import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatPKR,integerToBigInt } from "@/lib/money";
import { karachiBusinessDate } from "@/lib/queries";
import { ShopSaleForm,ShopSaleReversal } from "./shop-sale-form";
export const dynamic="force-dynamic";

export default async function Page(){
 const session=await requireSession(),database=await db(),today=karachiBusinessDate();
 const[products,customers,sales]=await Promise.all([
  database.collection("products").find({active:true,sellable:true,inventoryManaged:true,internalOnly:{$ne:true},sku:{$ne:"KUNDA-001"}}).sort({name:1}).toArray(),
  database.collection("customers").find({active:true,customerType:"shop"}).sort({name:1}).toArray(),
  database.collection("sales").find({channel:"shop"}).sort({createdAt:-1}).limit(100).toArray(),
 ]);
 return <div className="content">
  <div className="customer-heading"><div><div className="title">Shop Sales</div><div className="subtitle">Fast Paid Now and Credit/Udhaar sales. Walk-in Cash sales need no customer.</div></div><ShopSaleForm today={today} products={products.map(product=>({sku:String(product.sku),name:String(product.name),unit:String(product.unit),ratePaisa:integerToBigInt(product.retailRatePaisa).toString(),stockMilli:integerToBigInt(product.stockMilli).toString()}))} customers={customers.map(customer=>({id:customer._id.toString(),name:String(customer.name),code:String(customer.code)}))}/></div>
  <div className="card table-card table-scroll">{sales.length?<table className="table"><thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Payment</th><th>Total</th><th>COGS</th><th>Gross profit</th><th>Status</th><th>Actions</th></tr></thead><tbody>{sales.map(sale=><tr key={sale._id.toString()}><td><b>{String(sale.transactionNo)}</b></td><td>{String(sale.businessDate)}</td><td>{String(sale.customerNameSnapshot??"Walk-in customer")}</td><td>{sale.paymentType==="credit"?"Credit / Udhaar":`Paid Now · ${String(sale.paymentMethod)}`}</td><td>{formatPKR(integerToBigInt(sale.totalPaisa))}</td><td>{formatPKR(integerToBigInt(sale.totalCostOfGoodsSoldPaisa))}</td><td>{formatPKR(integerToBigInt(sale.grossProfitPaisa))}</td><td><span className="badge">{String(sale.status)}</span></td><td>{session.role==="owner"&&sale.status==="posted"?<ShopSaleReversal transactionNo={String(sale.transactionNo)}/>:null}</td></tr>)}</tbody></table>:<div className="empty-state"><b>No Shop Sales yet</b><span>Use New Shop Sale for Cash/Paid Now or Credit/Udhaar.</span></div>}</div>
 </div>;
}
