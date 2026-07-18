import { db } from "@/lib/db";
import { formatMilli, integerToBigInt } from "@/lib/money";
import { SettingsForm } from "./settings-form";
import { PageHeader } from "@/components/ui";

const money = (value: unknown) =>
  (Number(integerToBigInt(value)) / 100).toFixed(2);
export const dynamic = "force-dynamic";

export default async function Page() {
  const database=await db(),[row,egg]=await Promise.all([database.collection("business_settings").findOne({ _id: "default" as never }),database.collection("products").findOne({sku:"EGG-001"})]);
  const settings = {
    businessName: String(row?.businessName ?? ""),
    address: String(row?.address ?? ""),
    phone: String(row?.phone ?? ""),
    timezone: String(row?.timezone ?? "Asia/Karachi"),
    invoicePrefix: String(row?.invoicePrefix ?? "DF"),
    closingTime: String(row?.closingTime ?? "22:00"),
    allowedBackdateDays: Number(row?.allowedBackdateDays ?? 3),
    customerRate: money(row?.customerRatePaisa),
    shopRate: money(row?.shopRatePaisa),
    yogurtAutomaticMilkRatioParts: Number(
      row?.yogurtAutomaticMilkRatioParts ?? 40,
    ),
    yogurtAutomaticOutputRatioParts: Number(
      row?.yogurtAutomaticOutputRatioParts ?? 34,
    ),
    yogurtYieldToleranceMilli: Number(row?.yogurtYieldToleranceMilli ?? 20),
    yogurtDefaultProductionMode: String(
      row?.yogurtDefaultProductionMode ?? "automatic",
    ),
    milkInventoryUnit: String(row?.milkInventoryUnit ?? "liter"),
    milkDensityMilliKgPerLiter: row?.milkDensityMilliKgPerLiter
      ? formatMilli(integerToBigInt(row.milkDensityMilliKgPerLiter))
      : "",
    eggsPerTray:Number(egg?.piecesPerTray??30),
    eggPieceSellingPrice:money(egg?.pieceSellingRatePaisa??egg?.retailRatePaisa),
    eggTraySellingPrice:money(egg?.traySellingRatePaisa),
    eggDefaultSaleUnit:String(egg?.defaultSaleUnit??"piece"),
  };
  return (
    <div className="content settings-content">
      <PageHeader title="Business Settings" description="Rates and controls apply to new transactions; historical receipts never change."/>
      <SettingsForm settings={settings} />
    </div>
  );
}
