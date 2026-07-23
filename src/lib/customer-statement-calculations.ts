import { formatMilli, formatPKR, integerToBigInt } from "./money";

const asPKR = (value: bigint) => formatPKR(value);

export function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid statement month");
  const [year, value] = month.split("-").map(Number);
  if (value < 1 || value > 12) throw new Error("Invalid statement month");
  return { start: `${month}-01`, next: new Date(Date.UTC(year, value, 1)).toISOString().slice(0, 10) };
}
export function normalizePakistanPhone(value:string){const digits=value.replace(/\D/g,"");if(digits.startsWith("0092"))return digits.slice(2);if(digits.startsWith("92"))return digits;if(digits.startsWith("0"))return `92${digits.slice(1)}`;return `92${digits}`;}
export function calculateStatementTotals(input:{previousDebit:unknown;previousCredit:unknown;currentDebit:unknown;currentCredit:unknown;allDebit:unknown;allCredit:unknown;deliveries:Array<Record<string,unknown>>}){return{previousBalance:integerToBigInt(input.previousDebit)-integerToBigInt(input.previousCredit),currentCharges:integerToBigInt(input.currentDebit),payments:integerToBigInt(input.currentCredit),remainingBalance:integerToBigInt(input.allDebit)-integerToBigInt(input.allCredit),milkQuantity:input.deliveries.reduce((sum,row)=>sum+integerToBigInt(row.milkQuantityMilli),0n),milkCharges:input.deliveries.reduce((sum,row)=>sum+integerToBigInt(row.milkAmountPaisa),0n),otherProductCharges:input.deliveries.reduce((sum,row)=>sum+integerToBigInt(row.otherAmountPaisa),0n)}}

export function formatCustomerAccountSummaryMessage(input:{customerName:string;date:string;todayMilkQuantityMilli:bigint;todayChargesPaisa:bigint;previousOutstandingPaisa:bigint;totalChargesPaisa:bigint;totalPaymentsPaisa:bigint;currentOutstandingPaisa:bigint}){
  return [
    `Assalamu Alaikum ${input.customerName}`,
    ``,
    `Account Summary — ${input.date}`,
    `Today’s Milk Delivered: ${formatMilli(input.todayMilkQuantityMilli)} L`,
    `Today’s Bill: ${asPKR(input.todayChargesPaisa)}`,
    `Previous Outstanding Balance: ${asPKR(input.previousOutstandingPaisa)}`,
    `Total Charges: ${asPKR(input.totalChargesPaisa)}`,
    `Total Payments Received: ${asPKR(input.totalPaymentsPaisa)}`,
    `Current Remaining Balance: ${asPKR(input.currentOutstandingPaisa)}`,
    ``,
    `Thank you for your cooperation.`,
  ].join("\n");
}

export function formatVendorAccountSummaryMessage(input:{vendorName:string;date:string;todayMilkQuantityMilli:bigint;todayProcurementAmountPaisa:bigint;previousOutstandingPaisa:bigint;totalProcurementValuePaisa:bigint;totalPaymentsReceivedPaisa:bigint;currentRemainingPayablePaisa:bigint}){
  return [
    `Assalamu Alaikum ${input.vendorName}`,
    ``,
    `Vendor Account Summary — ${input.date}`,
    `Today’s Milk Supplied: ${formatMilli(input.todayMilkQuantityMilli)} L`,
    `Today’s Bill: ${asPKR(input.todayProcurementAmountPaisa)}`,
    `Previous Outstanding Balance: ${asPKR(input.previousOutstandingPaisa)}`,
    `Total Procurement Amount: ${asPKR(input.totalProcurementValuePaisa)}`,
    `Total Payments Received: ${asPKR(input.totalPaymentsReceivedPaisa)}`,
    `Remaining Payable Balance: ${asPKR(input.currentRemainingPayablePaisa)}`,
    ``,
    `Thank you for your support.`,
  ].join("\n");
}

export function formatCustomerStatementMessage(input:{customerName:string;month:string;milkQuantity:bigint;milkCharges:bigint;otherProductCharges:bigint;previousBalance:bigint;payments:bigint;remainingBalance:bigint}){return `Assalam-o-Alaikum ${input.customerName}. During ${input.month}, you received ${formatMilli(input.milkQuantity)} liters of milk. Milk charges: ${formatPKR(input.milkCharges)}. Other product charges: ${formatPKR(input.otherProductCharges)}. Previous balance: ${formatPKR(input.previousBalance)}. Payments received: ${formatPKR(input.payments)}. Your remaining DairyFlow balance is ${formatPKR(input.remainingBalance)}.`}
