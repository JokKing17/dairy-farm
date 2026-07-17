import { db } from "@/lib/db";
import { formatMilli, integerToBigInt } from "@/lib/money";
import { SettingsForm } from "./settings-form";

const money = (value: unknown) => (Number(integerToBigInt(value)) / 100).toFixed(2);
export const dynamic = "force-dynamic";

export default async function Page() {
  const row = await (await db()).collection("business_settings").findOne({ _id: "default" as never });
  const settings = {
    businessName: String(row?.businessName ?? ""), address: String(row?.address ?? ""),
    phone: String(row?.phone ?? ""), timezone: String(row?.timezone ?? "Asia/Karachi"),
    invoicePrefix: String(row?.invoicePrefix ?? "DF"), closingTime: String(row?.closingTime ?? "22:00"),
    allowedBackdateDays: Number(row?.allowedBackdateDays ?? 3),
    customerRate: money(row?.customerRatePaisa), shopRate: money(row?.shopRatePaisa),
    yogurtAutomaticMilkRatioParts:Number(row?.yogurtAutomaticMilkRatioParts??40),
    yogurtAutomaticOutputRatioParts:Number(row?.yogurtAutomaticOutputRatioParts??34),
    yogurtYieldToleranceMilli:Number(row?.yogurtYieldToleranceMilli??20),
    yogurtDefaultProductionMode:String(row?.yogurtDefaultProductionMode??"automatic"),
    milkInventoryUnit:String(row?.milkInventoryUnit??"liter"),
    milkDensityMilliKgPerLiter:row?.milkDensityMilliKgPerLiter?formatMilli(integerToBigInt(row.milkDensityMilliKgPerLiter)):"",
  };
  return <div className="content"><div className="title">Business settings</div><div className="subtitle">Rates and controls apply to new transactions; historical receipts never change.</div><SettingsForm settings={settings} /></div>;
}
