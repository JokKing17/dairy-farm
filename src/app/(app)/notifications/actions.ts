"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function markNotificationRead(formData: FormData): Promise<void> {
  const actor = await requireSession();
  const id = String(formData.get("id") ?? "");
  if (!ObjectId.isValid(id)) return;
  const now = new Date();
  await (await db()).collection("notifications").updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "read", readAt: now, updatedAt: now, updatedBy: actor.userId } },
  );
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

export async function markAllNotificationsRead(): Promise<void> {
  const actor = await requireSession();
  const now = new Date();
  await (await db()).collection("notifications").updateMany(
    { status: { $ne: "read" } },
    { $set: { status: "read", readAt: now, updatedAt: now, updatedBy: actor.userId } },
  );
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
