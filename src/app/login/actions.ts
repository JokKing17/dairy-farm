"use server";

import argon2 from "argon2";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { roles, type Role } from "@/lib/types";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
});

export type LoginState = { error?: string };

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email address and password." };

  let database;
  try { database = await db(); await database.command({ ping: 1 }); } catch { return { error: "DairyFlow cannot reach the database. Ask the owner to check the database settings." }; }
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const fingerprint = `${forwarded ?? requestHeaders.get("x-real-ip") ?? "local"}:${(requestHeaders.get("user-agent") ?? "unknown").slice(0, 120)}`;
  const windowStart = new Date(Date.now() - 15 * 60 * 1000);
  const [emailFailures, fingerprintFailures] = await Promise.all([database.collection("login_attempts").countDocuments({
    email: parsed.data.email,
    successful: false,
    createdAt: { $gte: windowStart },
  }), database.collection("login_attempts").countDocuments({ fingerprint, successful: false, createdAt: { $gte: windowStart } })]);
  if (emailFailures >= 10 || fingerprintFailures >= 20) return { error: "Too many attempts from this device. Try again in 15 minutes." };

  const user = await database.collection("users").findOne({ email: parsed.data.email });
  const valid = Boolean(user?.active && user.passwordHash && await argon2.verify(String(user.passwordHash), parsed.data.password));
  await database.collection("login_attempts").insertOne({
    email: parsed.data.email,
    userId: user?._id ?? null,
    fingerprint,
    successful: valid,
    createdAt: new Date(),
  });

  if (!valid || !user || !roles.includes(user.role)) return { error: "Invalid email or password." };

  await database.collection("users").updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await database.collection("audit_logs").insertOne({
    actorId: user._id,
    action: "login",
    entity: "session",
    entityId: null,
    createdAt: new Date(),
  });
  await createSession({
    _id: user._id,
    sessionVersion: Number(user.sessionVersion),
    name: String(user.name),
    email: String(user.email),
    role: user.role as Role,
  });
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
