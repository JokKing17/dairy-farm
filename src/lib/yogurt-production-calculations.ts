import { multiplyQuantityRate } from "./money";

export type KundaCalculationInput={sizeMilliKg:bigint;numberOfKundas:number};

export function calculateKundaOutput(entries:KundaCalculationInput[]){
  return entries.reduce((total,entry)=>{
    if(entry.sizeMilliKg<=0n||!Number.isSafeInteger(entry.numberOfKundas)||entry.numberOfKundas<0)throw new Error("Kunda size and count must be valid.");
    return total+entry.sizeMilliKg*BigInt(entry.numberOfKundas);
  },0n);
}

export function calculateYogurtProduction(input:{
  milkUsedMilli:bigint;
  milkAverageCostPaisa:bigint;
  kundaEntries:KundaCalculationInput[];
  looseYogurtMilli:bigint;
  additionalCostsPaisa:bigint[];
  sellingRatePaisa:bigint;
}){
  if(input.milkUsedMilli<=0n)throw new Error("Fresh Milk used must be greater than zero.");
  if(input.milkAverageCostPaisa<0n||input.looseYogurtMilli<0n||input.sellingRatePaisa<=0n||input.additionalCostsPaisa.some(cost=>cost<0n))throw new Error("Production quantities and costs are invalid.");
  const kundaOutputMilli=calculateKundaOutput(input.kundaEntries);
  const actualOutputMilli=kundaOutputMilli+input.looseYogurtMilli;
  if(actualOutputMilli<=0n)throw new Error("Enter at least one Kunda or some loose Yogurt.");
  const milkMaterialCostPaisa=multiplyQuantityRate(input.milkUsedMilli,input.milkAverageCostPaisa);
  const additionalCostPaisa=input.additionalCostsPaisa.reduce((sum,cost)=>sum+cost,0n);
  const totalProductionCostPaisa=milkMaterialCostPaisa+additionalCostPaisa;
  const yogurtUnitCostPaisa=(totalProductionCostPaisa*1000n+actualOutputMilli/2n)/actualOutputMilli;
  const estimatedRevenuePaisa=multiplyQuantityRate(actualOutputMilli,input.sellingRatePaisa);
  return{
    kundaOutputMilli,actualOutputMilli,milkMaterialCostPaisa,additionalCostPaisa,totalProductionCostPaisa,
    yogurtUnitCostPaisa,estimatedRevenuePaisa,
    estimatedGrossProfitPaisa:estimatedRevenuePaisa-totalProductionCostPaisa,
    yieldMilli:(actualOutputMilli*1000n+input.milkUsedMilli/2n)/input.milkUsedMilli,
  };
}
