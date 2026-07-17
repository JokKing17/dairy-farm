"use client";
import { useActionState,useState } from "react";
import { createCustomer,recordCustomerPayment,type ActionState } from "./actions";
const initial:ActionState={};
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

export function CustomerForm(){
 const[state,action,pending]=useActionState(createCustomer,initial),[type,setType]=useState<"household"|"shop">("household");
 return <details className="card table-card"><summary className="button">Add Customer</summary><form action={action} className="formgrid" style={{marginTop:18}}>
  {state.error?<div className="form-error">{state.error}</div>:null}{state.success?<div className="form-success">{state.success}</div>:null}
  <div className="field"><label>Customer type</label><select name="customerType" value={type} onChange={event=>setType(event.target.value as typeof type)}><option value="household">Household Delivery Customer</option><option value="shop">Shop Customer</option></select></div>
  <div className="field"><label>{type==="shop"?"Customer or account name":"Name"}</label><input name="name" required/></div>
  <div className="field"><label>Phone {type==="shop"?"(optional)":""}</label><input name="phone" required={type==="household"}/></div>
  <div className="field"><label>WhatsApp (optional)</label><input name="whatsapp"/></div>
  {type==="household"?<><div className="field"><label>House / delivery address</label><input name="address" required/></div><div className="field"><label>Normal daily Milk (liters)</label><input name="dailyQuantity" inputMode="decimal" required/></div><div className="field"><label>Start date</label><input name="startDate" type="date" defaultValue={today()} required/></div><input type="hidden" name="deliveryDays" value="1,2,3,4,5,6,7"/></>:<div className="field"><label>Address (optional)</label><input name="address"/></div>}
  <details><summary>More options</summary>{type==="household"?<><div className="field"><label>Customer-specific Milk rate (optional)</label><input name="milkRate" inputMode="decimal"/></div><div className="field"><label>Visiting order (optional)</label><input name="deliverySequence" type="number" min="1"/></div><label><input type="checkbox" name="paused"/> Delivery currently paused</label></>:null}<div className="field"><label>Opening amount to receive</label><input name="openingBalance" defaultValue="0"/></div><div className="field"><label>Notes</label><textarea name="notes"/></div></details>
  <button className="button" disabled={pending}>{pending?"Saving…":"Save customer"}</button>
 </form></details>;
}

export function PaymentForm({id,businessDate}:{id:string;businessDate:string}){const[state,action,pending]=useActionState(recordCustomerPayment,initial);const[open,setOpen]=useState(false);const[key]=useState(()=>crypto.randomUUID());return <><button className="button secondary" type="button" onClick={()=>setOpen(true)}>Record payment</button>{open?<div className="review-dialog"><form action={action} className="card review-card"><input type="hidden" name="partyType" value="customer"/><input type="hidden" name="partyId" value={id}/><input type="hidden" name="businessDate" value={businessDate}/><input type="hidden" name="idempotencyKey" value={key}/><div className="section-title">Money received</div>{state.error?<div className="form-error">{state.error}</div>:null}{state.success?<div className="form-success">{state.success}</div>:null}<div className="field"><label>Amount (PKR)</label><input name="amount" inputMode="decimal" required autoFocus/></div><div className="field"><label>Received in</label><select name="method"><option value="cash">Cash</option><option value="easypaisa">Easypaisa</option><option value="jazzcash">JazzCash</option><option value="bank">Bank</option></select></div><div className="toolbar"><button type="button" className="button secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="button" disabled={pending}>{pending?"Saving…":"Save receipt"}</button></div></form></div>:null}</>}
