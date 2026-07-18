import { integerToBigInt,quantityToMilli } from "./money";

export const DEFAULT_EGGS_PER_TRAY=30;
export type EggUnit="piece"|"tray";

export function validatePiecesPerTray(value:unknown,max=120){
  if(value===undefined||value===null||value==="")return DEFAULT_EGGS_PER_TRAY;
  const text=String(value).trim();
  if(!/^\d+$/.test(text))throw new Error(`Eggs per tray must be a whole number between 1 and ${max}.`);
  const parsed=Number(text);
  if(!Number.isSafeInteger(parsed)||parsed<1||parsed>max)throw new Error(`Eggs per tray must be a whole number between 1 and ${max}.`);
  return parsed;
}

export function wholeEnteredQuantity(value:string,label:string){
  const milli=quantityToMilli(value);
  if(milli<=0n||milli%1000n!==0n)throw new Error(`${label} must be a positive whole number.`);
  return milli/1000n;
}

export function normalizeEggQuantity(value:string,unit:EggUnit,piecesPerTray:number){
  const enteredQuantity=wholeEnteredQuantity(value,unit==="tray"?"Egg tray quantity":"Egg piece quantity");
  const normalizedPieces=unit==="tray"?enteredQuantity*BigInt(piecesPerTray):enteredQuantity;
  return{enteredQuantity,enteredUnit:unit,normalizedPieces,normalizedQuantityMilli:normalizedPieces*1000n,piecesPerTraySnapshot:piecesPerTray};
}

export function eggPurchaseCalculation(input:{enteredQuantity:bigint;enteredUnit:EggUnit;buyingPricePerEnteredUnitPaisa:bigint;piecesPerTray:number;existingStockMilli:bigint;existingAverageCostPerPiecePaisa:bigint}){
  if(input.buyingPricePerEnteredUnitPaisa<=0n)throw new Error("Egg buying price must be greater than zero.");
  if(input.existingStockMilli<0n||input.existingStockMilli%1000n!==0n)throw new Error("Existing Egg stock is not stored as whole pieces.");
  const normalizedPieces=input.enteredUnit==="tray"?input.enteredQuantity*BigInt(input.piecesPerTray):input.enteredQuantity,normalizedQuantityMilli=normalizedPieces*1000n,purchaseTotalPaisa=input.enteredQuantity*input.buyingPricePerEnteredUnitPaisa,existingPieces=input.existingStockMilli/1000n,resultingPieces=existingPieces+normalizedPieces;
  const resultingAverageCostPerPiecePaisa=(existingPieces*input.existingAverageCostPerPiecePaisa+purchaseTotalPaisa+resultingPieces/2n)/resultingPieces;
  const purchaseCostPerPiecePaisa=(purchaseTotalPaisa+normalizedPieces/2n)/normalizedPieces;
  return{normalizedPieces,normalizedQuantityMilli,purchaseTotalPaisa,purchaseCostPerPiecePaisa,resultingStockMilli:input.existingStockMilli+normalizedQuantityMilli,resultingAverageCostPerPiecePaisa};
}

export function eggSaleCalculation(input:{enteredQuantity:bigint;enteredUnit:EggUnit;piecesPerTray:number;pieceRatePaisa:bigint;trayRatePaisa:bigint;averageCostPerPiecePaisa:bigint}){
  const normalizedPieces=input.enteredUnit==="tray"?input.enteredQuantity*BigInt(input.piecesPerTray):input.enteredQuantity,normalizedQuantityMilli=normalizedPieces*1000n,rate=input.enteredUnit==="tray"?input.trayRatePaisa:input.pieceRatePaisa;
  if(rate<=0n)throw new Error(`Set a valid Egg price per ${input.enteredUnit} first.`);
  const lineAmountPaisa=input.enteredQuantity*rate,costOfGoodsSoldPaisa=normalizedPieces*input.averageCostPerPiecePaisa;
  return{normalizedPieces,normalizedQuantityMilli,sellingRatePerEnteredUnitPaisa:rate,lineAmountPaisa,costOfGoodsSoldPaisa,grossProfitPaisa:lineAmountPaisa-costOfGoodsSoldPaisa};
}

export function formatEggStock(stockMilli:unknown,piecesPerTray:unknown){
  const milli=integerToBigInt(stockMilli),conversion=BigInt(validatePiecesPerTray(piecesPerTray));
  if(milli<0n||milli%1000n!==0n)throw new Error("Egg stock must contain whole pieces.");
  const totalPieces=milli/1000n;
  return{totalPieces,fullTrays:totalPieces/conversion,loosePieces:totalPieces%conversion,label:`${totalPieces/conversion} trays + ${totalPieces%conversion} pieces`};
}
