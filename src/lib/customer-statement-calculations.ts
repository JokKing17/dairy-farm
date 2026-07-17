import { formatMilli, formatPKR, integerToBigInt } from "./money";

export function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid statement month");
  const [year, value] = month.split("-").map(Number);
  if (value < 1 || value > 12) throw new Error("Invalid statement month");
  return { start: `${month}-01`, next: new Date(Date.UTC(year, value, 1)).toISOString().slice(0, 10) };
}
export function normalizePakistanPhone(value:string){const digits=value.replace(/\D/g,"");if(digits.startsWith("0092"))return digits.slice(2);if(digits.startsWith("92"))return digits;if(digits.startsWith("0"))return `92${digits.slice(1)}`;return `92${digits}`;}
export function calculateStatementTotals(input:{previousDebit:unknown;previousCredit:unknown;currentDebit:unknown;currentCredit:unknown;allDebit:unknown;allCredit:unknown;deliveries:Array<Record<string,unknown>>}){return{previousBalance:integerToBigInt(input.previousDebit)-integerToBigInt(input.previousCredit),currentCharges:integerToBigInt(input.currentDebit),payments:integerToBigInt(input.currentCredit),remainingBalance:integerToBigInt(input.allDebit)-integerToBigInt(input.allCredit),milkQuantity:input.deliveries.reduce((sum,row)=>sum+integerToBigInt(row.milkQuantityMilli),0n),milkCharges:input.deliveries.reduce((sum,row)=>sum+integerToBigInt(row.milkAmountPaisa),0n),otherProductCharges:input.deliveries.reduce((sum,row)=>sum+integerToBigInt(row.otherAmountPaisa),0n)}}
export function formatCustomerStatementMessage(input:{customerName:string;month:string;milkQuantity:bigint;milkCharges:bigint;otherProductCharges:bigint;previousBalance:bigint;payments:bigint;remainingBalance:bigint}){return `Assalam-o-Alaikum ${input.customerName}. During ${input.month}, you received ${formatMilli(input.milkQuantity)} liters of milk. Milk charges: ${formatPKR(input.milkCharges)}. Other product charges: ${formatPKR(input.otherProductCharges)}. Previous balance: ${formatPKR(input.previousBalance)}. Payments received: ${formatPKR(input.payments)}. Your remaining DairyFlow balance is ${formatPKR(input.remainingBalance)}.`}
