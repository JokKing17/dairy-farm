"use server";
import { Long } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { integerToBigInt, quantityToMilli, rupeesToPaisa } from "@/lib/money";
const schema = z.object({
  businessName: z.string().trim().min(2),
  address: z.string().trim(),
  phone: z.string().trim(),
  currency: z.literal("PKR"),
  timezone: z.string().trim().min(3),
  customerRate: z.string(),
  shopRate: z.string(),
  invoicePrefix: z.string().trim().min(1).max(8),
  closingTime: z.string(),
  allowedBackdateDays: z.coerce.number().int().min(0).max(31),
  yogurtAutomaticMilkRatioParts: z.coerce.number().int().min(1).max(1000),
  yogurtAutomaticOutputRatioParts: z.coerce.number().int().min(1).max(1000),
  yogurtYieldToleranceMilli: z.coerce.number().int().min(0).max(200),
  yogurtDefaultProductionMode: z.enum(["automatic", "manual"]),
  milkInventoryUnit: z.enum(["liter", "kilogram"]),
  milkDensityMilliKgPerLiter: z.string(),
  eggsPerTray: z.coerce.number().int().min(1).max(120),
  eggPieceSellingPrice: z.string(),
  eggTraySellingPrice: z.string(),
  eggDefaultSaleUnit: z.enum(["piece", "tray"]),
  confirmEggConversionChange: z.string().optional(),
});
export type SettingsState = { error?: string; success?: string };
export async function saveSettings(
  _: SettingsState,
  data: FormData,
): Promise<SettingsState> {
  const actor = await requireSession(["owner"]),
    parsed = schema.safeParse(Object.fromEntries(data));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the settings." };
  try {
    const value = parsed.data;
    if (
      value.yogurtAutomaticOutputRatioParts >=
      value.yogurtAutomaticMilkRatioParts
    )
      return { error: "Yogurt output ratio must be less than the Milk ratio." };
    let density: bigint | null = null;
    if (value.milkInventoryUnit === "liter") {
      try {
        density = quantityToMilli(value.milkDensityMilliKgPerLiter);
      } catch {
        return { error: "Enter Milk density in kilograms per liter." };
      }
      if (density <= 0n)
        return { error: "Milk density must be greater than zero." };
    }
    const {eggsPerTray,eggPieceSellingPrice,eggTraySellingPrice,eggDefaultSaleUnit,confirmEggConversionChange,...businessValue}=value;
    void eggsPerTray;void eggPieceSellingPrice;void eggTraySellingPrice;void eggDefaultSaleUnit;void confirmEggConversionChange;
    const database = await db(),
      now = new Date(),
      customerRatePaisa = Long.fromBigInt(rupeesToPaisa(value.customerRate)),
      shopRatePaisa = Long.fromBigInt(rupeesToPaisa(value.shopRate)),
      yieldMilli = Math.floor(
        (value.yogurtAutomaticOutputRatioParts * 1000) /
          value.yogurtAutomaticMilkRatioParts,
      ),
      lossMilli = 1000 - yieldMilli,
      pieceRatePaisa = rupeesToPaisa(value.eggPieceSellingPrice),
      trayRatePaisa = rupeesToPaisa(value.eggTraySellingPrice);
    if(pieceRatePaisa<0n||trayRatePaisa<0n)return{error:"Egg selling prices cannot be negative."};
    const egg=await database.collection("products").findOne({sku:"EGG-001"});
    if(!egg)return{error:"EGG-001 is missing. Run the migration or seed command."};
    if(Number(egg.piecesPerTray??30)!==value.eggsPerTray&&value.confirmEggConversionChange!=="on")return{error:"Confirm the Eggs-per-tray change. It applies only to future transactions."};
    await database
      .collection("business_settings")
      .updateOne(
        { _id: "default" as never },
        {
          $set: {
            ...businessValue,
            customerRatePaisa,
            shopRatePaisa,
            yogurtAutomaticYieldMilli: yieldMilli,
            yogurtAutomaticLossMilli: lossMilli,
            yogurtMilkInputUnit: "kilogram",
            milkDensityMilliKgPerLiter: density
              ? Long.fromBigInt(density)
              : null,
            updatedAt: now,
            updatedBy: actor.userId,
          },
          $setOnInsert: { createdAt: now, createdBy: actor.userId },
        },
        { upsert: true },
      );
    const effectiveFrom=now;
    for(const[unit,previous,rate]of [["piece",integerToBigInt(egg.pieceSellingRatePaisa,egg.retailRatePaisa),pieceRatePaisa],["tray",integerToBigInt(egg.traySellingRatePaisa),trayRatePaisa]] as const){
      if(rate===previous)continue;
      await database.collection("product_rate_history").updateMany({productId:egg._id,saleUnit:unit,effectiveTo:null},{$set:{effectiveTo:effectiveFrom,updatedAt:now,updatedBy:actor.userId}});
      await database.collection("product_rate_history").insertOne({productId:egg._id,productSku:"EGG-001",saleUnit:unit,previousRatePaisa:Long.fromBigInt(previous),ratePaisa:Long.fromBigInt(rate),effectiveFrom,effectiveTo:null,source:"egg_settings",createdAt:now,createdBy:actor.userId});
    }
    await database.collection("products").updateOne({_id:egg._id},{$set:{unit:"piece",baseUnit:"piece",purchaseUnit:"tray",saleUnits:["piece","tray"],piecesPerTray:value.eggsPerTray,defaultSaleUnit:value.eggDefaultSaleUnit,retailRatePaisa:Long.fromBigInt(pieceRatePaisa),pieceSellingRatePaisa:Long.fromBigInt(pieceRatePaisa),traySellingRatePaisa:Long.fromBigInt(trayRatePaisa),updatedAt:now,updatedBy:actor.userId}});
    await database
      .collection("audit_logs")
      .insertOne({
        actorId: actor.userId,
        action: "update",
        entity: "business_settings",
        entityId: "default",
        metadata: {
          yogurtRatio: `${value.yogurtAutomaticMilkRatioParts}:${value.yogurtAutomaticOutputRatioParts}`,
          milkInventoryUnit: value.milkInventoryUnit,
          eggSettings:{piecesPerTray:value.eggsPerTray,defaultSaleUnit:value.eggDefaultSaleUnit,pieceRatePaisa:pieceRatePaisa.toString(),trayRatePaisa:trayRatePaisa.toString()},
        },
        createdAt: now,
      });
    for (const path of ["/settings", "/production", "/reports","/inventory","/sales","/deliveries"])
      revalidatePath(path);
    return { success: "Business settings saved." };
  } catch {
    return {
      error: "Settings could not be saved. Check the database connection.",
    };
  }
}
