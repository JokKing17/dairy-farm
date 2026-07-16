"use server";

import { Long } from "mongodb";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { rupeesToPaisa } from "@/lib/money";
import { vendorSchema } from "@/lib/schemas/vendor";

export type VendorActionState = { error?: string; success?: string };

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
