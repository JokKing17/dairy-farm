import { multiplyQuantityRate } from "./money";

export const YOGURT_PRODUCTION_DEFAULTS={
  milkRatioParts:40n,
  yogurtRatioParts:34n,
  standardYieldMilli:850n,
  standardLossMilli:150n,
  yieldToleranceMilli:20n,
} as const;

export type KundaCalculationInput={sizeMilliKg:bigint;numberOfKundas:number};
export function floorRatio(value:bigint,numerator:bigint,denominator:bigint){if(value<0n||numerator<=0n||denominator<=0n)throw new Error("Ratio values are invalid.");return value*numerator/denominator}
export function ceilRatio(value:bigint,numerator:bigint,denominator:bigint){if(value<0n||numerator<=0n||denominator<=0n)throw new Error("Ratio values are invalid.");return(value*numerator+denominator-1n)/denominator}
export function calculateAutomaticYogurtOutput(milkInputMilli:bigint,milkRatioParts:bigint,yogurtRatioParts:bigint){return floorRatio(milkInputMilli,yogurtRatioParts,milkRatioParts)}
export function calculateAutomaticMilkRequirement(yogurtOutputMilli:bigint,milkRatioParts:bigint,yogurtRatioParts:bigint){return ceilRatio(yogurtOutputMilli,milkRatioParts,yogurtRatioParts)}
export function calculateProductionLoss(milkInputMilli:bigint,yogurtOutputMilli:bigint){if(milkInputMilli<=0n||yogurtOutputMilli<=0n||yogurtOutputMilli>milkInputMilli)throw new Error("Yogurt output cannot exceed Milk input.");return milkInputMilli-yogurtOutputMilli}
export function calculateActualYield(milkInputMilli:bigint,yogurtOutputMilli:bigint){if(milkInputMilli<=0n||yogurtOutputMilli<=0n)return 0n;return(yogurtOutputMilli*1000n+milkInputMilli/2n)/milkInputMilli}
export function calculateYieldVariance(milkInputMilli:bigint,actualOutputMilli:bigint,milkRatioParts:bigint,yogurtRatioParts:bigint){const expected=calculateAutomaticYogurtOutput(milkInputMilli,milkRatioParts,yogurtRatioParts);return{standardExpectedYogurtMilli:expected,yieldVarianceMilli:actualOutputMilli-expected,actualYieldMilli:calculateActualYield(milkInputMilli,actualOutputMilli)}}
export function calculateKundaOutput(entries:KundaCalculationInput[]){return entries.reduce((total,entry)=>{if(entry.sizeMilliKg<=0n||!Number.isSafeInteger(entry.numberOfKundas)||entry.numberOfKundas<0)throw new Error("Kunda size and count must be valid.");return total+entry.sizeMilliKg*BigInt(entry.numberOfKundas)},0n)}
export function suggestKundaBreakdown(yogurtMilli:bigint){
  if(yogurtMilli<0n)throw new Error("Yogurt quantity cannot be negative.");
  let best={threeKg:0,threePointFiveKg:0,looseMilli:yogurtMilli,containers:0};
  for(let threePointFiveKg=0;BigInt(threePointFiveKg)*3500n<=yogurtMilli;threePointFiveKg++){
    const remaining=yogurtMilli-BigInt(threePointFiveKg)*3500n,threeKg=Number(remaining/3000n),looseMilli=remaining-BigInt(threeKg)*3000n,containers=threePointFiveKg+threeKg;
    if(looseMilli<best.looseMilli||(looseMilli===best.looseMilli&&containers<best.containers)||(looseMilli===best.looseMilli&&containers===best.containers&&threePointFiveKg>best.threePointFiveKg))best={threeKg,threePointFiveKg,looseMilli,containers};
  }
  return best;
}
export function convertMilkWeightToInventoryQuantity(milkWeightMilli:bigint,inventoryUnit:"liter"|"kilogram",densityMilliKgPerLiter?:bigint){if(inventoryUnit==="kilogram")return milkWeightMilli;if(!densityMilliKgPerLiter||densityMilliKgPerLiter<=0n)throw new Error("Set Milk density in Business Settings before producing Yogurt.");return ceilRatio(milkWeightMilli,1000n,densityMilliKgPerLiter)}

export function calculateYogurtProduction(input:{milkWeightMilli:bigint;milkInventoryQuantityMilli:bigint;milkAverageCostPaisa:bigint;actualOutputMilli:bigint;kundaEntries:KundaCalculationInput[];looseYogurtMilli:bigint;additionalCostsPaisa:bigint[];sellingRatePaisa:bigint;milkRatioParts:bigint;yogurtRatioParts:bigint}){
  if(input.milkWeightMilli<=0n||input.milkInventoryQuantityMilli<=0n||input.actualOutputMilli<=0n)throw new Error("Milk and Yogurt quantities must be greater than zero.");
  if(input.actualOutputMilli>input.milkWeightMilli)throw new Error("Yogurt output cannot be greater than Milk input.");
  if(input.milkAverageCostPaisa<0n||input.looseYogurtMilli<0n||input.sellingRatePaisa<=0n||input.additionalCostsPaisa.some(cost=>cost<0n))throw new Error("Production quantities and costs are invalid.");
  const kundaOutputMilli=calculateKundaOutput(input.kundaEntries);
  if(kundaOutputMilli+input.looseYogurtMilli!==input.actualOutputMilli)throw new Error("Kunda and loose Yogurt quantities do not match the total Yogurt produced.");
  const variance=calculateYieldVariance(input.milkWeightMilli,input.actualOutputMilli,input.milkRatioParts,input.yogurtRatioParts);
  const processingLossMilli=calculateProductionLoss(input.milkWeightMilli,input.actualOutputMilli),actualLossPercentageMilli=(processingLossMilli*1000n+input.milkWeightMilli/2n)/input.milkWeightMilli;
  const milkMaterialCostPaisa=multiplyQuantityRate(input.milkInventoryQuantityMilli,input.milkAverageCostPaisa),additionalCostPaisa=input.additionalCostsPaisa.reduce((sum,cost)=>sum+cost,0n),totalProductionCostPaisa=milkMaterialCostPaisa+additionalCostPaisa;
  const yogurtUnitCostPaisa=(totalProductionCostPaisa*1000n+input.actualOutputMilli/2n)/input.actualOutputMilli,estimatedRevenuePaisa=multiplyQuantityRate(input.actualOutputMilli,input.sellingRatePaisa);
  return{kundaOutputMilli,actualOutputMilli:input.actualOutputMilli,milkMaterialCostPaisa,additionalCostPaisa,totalProductionCostPaisa,yogurtUnitCostPaisa,estimatedRevenuePaisa,estimatedGrossProfitPaisa:estimatedRevenuePaisa-totalProductionCostPaisa,processingLossMilli,actualLossPercentageMilli,...variance,yieldVariancePercentageMilli:variance.actualYieldMilli-(input.yogurtRatioParts*1000n/input.milkRatioParts)};
}
