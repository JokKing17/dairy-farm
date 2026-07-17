import { db } from "@/lib/db";
import { formatPKR, integerToBigInt } from "@/lib/money";
import { karachiBusinessDate } from "@/lib/queries";
import { CustomerForm, PaymentForm } from "./customer-forms";
export const dynamic = "force-dynamic";
const phone = (value: string) => { const n=value.replace(/\D/g,""); return n.startsWith("0")?`92${n.slice(1)}`:n.startsWith("92")?n:`92${n}`; };

export default async function Page() {
  const database=await db();
  const rows=await database.collection("customers").aggregate([
    {$sort:{name:1}},
    {$lookup:{from:"party_ledger_entries",let:{id:"$_id"},pipeline:[{$match:{$expr:{$and:[{$eq:["$partyId","$$id"]},{$eq:["$status","posted"]}]}}},{$group:{_id:null,balance:{$sum:{$subtract:["$debitPaisa","$creditPaisa"]}}}}],as:"ledger"}},
    {$project:{code:1,name:1,phone:1,address:1,active:1,balance:{$ifNull:[{$first:"$ledger.balance"},0]}}},
  ]).toArray();
  const today=karachiBusinessDate();
  return <div className="content"><div className="title">Customers</div><div className="subtitle">Daily customers and money to receive.</div><CustomerForm/><div className="card table-card table-scroll">{rows.length?<table className="table"><thead><tr><th>Code</th><th>Customer</th><th>Phone</th><th>Money to receive</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map(row=>{const balance=integerToBigInt(row.balance);const message=encodeURIComponent(`Assalam-o-Alaikum ${row.name}. Your DairyFlow balance on ${today} is ${formatPKR(balance)}.`);return <tr key={row._id.toString()}><td><b>{row.code}</b></td><td>{row.name}<div className="subtitle">{row.address}</div></td><td>{row.phone}</td><td>{formatPKR(balance)}</td><td><span className="badge">{row.active?"Active":"Inactive"}</span></td><td><div className="toolbar"><PaymentForm id={row._id.toString()} today={today}/><a className="button secondary" href={`https://wa.me/${phone(String(row.phone))}?text=${message}`} target="_blank" rel="noreferrer">WhatsApp</a></div></td></tr>})}</tbody></table>:<div className="empty-state"><b>No customers yet</b><span>Add the first customer to start deliveries.</span></div>}</div></div>;
}
