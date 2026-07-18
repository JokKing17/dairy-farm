"use server";

import { Long, ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { rupeesToPaisa } from "@/lib/money";
import { vendorSchema } from "@/lib/schemas/vendor";

export type VendorActionState = { error?: string; success?: string };
const vendorUpdateSchema = vendorSchema.extend({ id: z.string().min(1) });

export async function createVendor(_: VendorActionState, formData: FormData): Promise<VendorActionState> {
  const actor = await requireSession(["owner", "manager", "accountant"]);
  const parsed = vendorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid vendor details" };

  let opening: bigint;
  let rate: bigint;
  try {
    opening = rupeesToPaisa(parsed.data.openingBalance);
    rate = rupeesToPaisa(parsed.data.milkRate);
  } catch {
    return { error: "Opening balance and milk rate must be valid PKR amounts." };
  }
  if (rate <= 0n) return { error: "Milk rate must be greater than zero." };

  try {
    await transaction(async (database, session) => {
      const now = new Date();
      const result = await database.collection("vendors").insertOne({
        code: parsed.data.code,
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        whatsapp: parsed.data.whatsapp || null,
        address: parsed.data.address || null,
        notes: parsed.data.notes || null,
        active: true,
        openingBalancePaisa: Long.fromBigInt(opening),
        createdAt: now,
        createdBy: actor.userId,
        updatedAt: now,
        updatedBy: actor.userId,
      }, { session });
      await database.collection("vendor_rate_history").insertOne({
        vendorId: result.insertedId,
        productSku: "MILK-001",
        ratePaisa: Long.fromBigInt(rate),
        effectiveFrom: now,
        effectiveTo: null,
        reason: "Initial vendor rate",
        createdAt: now,
        createdBy: actor.userId,
      }, { session });
      if (opening !== 0n) {
        await database.collection("party_ledger_entries").insertOne({
          transactionNo: `OPEN-V-${result.insertedId.toHexString()}`,
          lineNo: 1,
          partyType: "vendor",
          partyId: result.insertedId,
          date: now,
          debitPaisa: opening < 0n ? Long.fromBigInt(-opening) : Long.ZERO,
          creditPaisa: opening > 0n ? Long.fromBigInt(opening) : Long.ZERO,
          description: "Opening balance",
          status: "posted",
          createdAt: now,
          createdBy: actor.userId,
        }, { session });
      }
      await database.collection("audit_logs").insertOne({ actorId: actor.userId, action: "create", entity: "vendor", entityId: result.insertedId, createdAt: now }, { session });
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) return { error: "Vendor code already exists." };
    return { error: "The vendor could not be saved. Please try again." };
  }
  revalidatePath("/vendors");
  revalidatePath("/quick-entry");
  return { success: "Vendor created." };
}

export async function updateVendor(_: VendorActionState, formData: FormData): Promise<VendorActionState> {
  const actor = await requireSession(["owner", "manager", "accountant"]);
  const parsed = vendorUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid vendor details" };
  let rate: bigint;
  try { rate = rupeesToPaisa(parsed.data.milkRate); } catch { return { error: "Milk rate must be a valid PKR amount." }; }
  if (rate <= 0n) return { error: "Milk rate must be greater than zero." };
  try {
    await transaction(async (database, session) => {
      const vendorId = new ObjectId(parsed.data.id);
      const now = new Date();
      const existing = await database.collection("vendors").findOne({ _id: vendorId }, { session });
      if (!existing) throw new Error("Vendor not found.");
      await database.collection("vendors").updateOne({ _id: vendorId }, { $set: { code: parsed.data.code, name: parsed.data.name, phone: parsed.data.phone || null, whatsapp: parsed.data.whatsapp || null, address: parsed.data.address || null, notes: parsed.data.notes || null, updatedAt: now, updatedBy: actor.userId } }, { session });
      const currentRate = await database.collection("vendor_rate_history").findOne({ vendorId, productSku: "MILK-001", effectiveTo: null }, { session, sort: { effectiveFrom: -1 } });
      if (currentRate?.ratePaisa?.toString() !== rate.toString()) {
        await database.collection("vendor_rate_history").updateMany({ vendorId, productSku: "MILK-001", effectiveTo: null }, { $set: { effectiveTo: now, updatedAt: now, updatedBy: actor.userId } }, { session });
        await database.collection("vendor_rate_history").insertOne({ vendorId, productSku: "MILK-001", previousRatePaisa: currentRate?.ratePaisa ?? null, ratePaisa: Long.fromBigInt(rate), effectiveFrom: now, effectiveTo: null, reason: "Vendor details updated", createdAt: now, createdBy: actor.userId }, { session });
      }
      await database.collection("audit_logs").insertOne({ actorId: actor.userId, action: "update", entity: "vendor", entityId: vendorId, createdAt: now }, { session });
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) return { error: "Vendor code already exists." };
    return { error: error instanceof Error ? error.message : "Vendor could not be updated." };
  }
  revalidatePath("/vendors"); revalidatePath("/quick-entry");
  return { success: "Vendor updated." };
}

export async function deactivateVendor(_: VendorActionState, formData: FormData): Promise<VendorActionState> {
  const actor = await requireSession(["owner"]);
  const id = String(formData.get("id") ?? "");
  try {
    await transaction(async (database, session) => {
      const vendorId = new ObjectId(id), now = new Date();
      const result = await database.collection("vendors").updateOne({ _id: vendorId, active: true }, { $set: { active: false, deactivatedAt: now, deactivatedBy: actor.userId, updatedAt: now, updatedBy: actor.userId } }, { session });
      if (!result.modifiedCount) throw new Error("Vendor is missing or already inactive.");
      await database.collection("audit_logs").insertOne({ actorId: actor.userId, action: "deactivate", entity: "vendor", entityId: vendorId, createdAt: now }, { session });
    });
  } catch (error) { return { error: error instanceof Error ? error.message : "Vendor could not be deactivated." }; }
  revalidatePath("/vendors"); revalidatePath("/quick-entry");
  return { success: "Vendor deactivated." };
}
