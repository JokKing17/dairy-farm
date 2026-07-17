import "server-only";

import { cookies, headers } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { ObjectId } from "mongodb";
import { redirect } from "next/navigation";
import { db } from "./db";
import { env } from "./env";
import { roles, type Role } from "./types";

const SESSION_COOKIE = "dairyflow_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;
const key = new TextEncoder().encode(env.SESSION_SECRET);

type TokenPayload = {
  userId: string;
  sessionId: string;
  sessionVersion: number;
};

export type Session = TokenPayload & {
  name: string;
  email: string;
  role: Role;
};

export async function createSession(user: {
  _id: ObjectId;
  sessionVersion: number;
  name: string;
  email: string;
  role: Role;
}) {
  const database = await db();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);
  const requestHeaders = await headers();

  await database.collection("sessions").insertOne({
    sessionId,
    userId: user._id,
    sessionVersion: user.sessionVersion,
    expiresAt,
    revokedAt: null,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null,
    createdAt: new Date(),
    lastSeenAt: new Date(),
  });

  const token = await new SignJWT({
    userId: user._id.toHexString(),
    sessionId,
    sessionVersion: user.sessionVersion,
  } satisfies TokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

async function readToken(): Promise<TokenPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, key);
    const payload = verified.payload as Partial<TokenPayload>;
    if (!payload.userId || !payload.sessionId || typeof payload.sessionVersion !== "number") return null;
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const token = await readToken();
  if (!token || !ObjectId.isValid(token.userId)) return null;

  const database = await db();
  const [storedSession, user] = await Promise.all([
    database.collection("sessions").findOne({
      sessionId: token.sessionId,
      userId: new ObjectId(token.userId),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }),
    database.collection("users").findOne({ _id: new ObjectId(token.userId), active: true }),
  ]);

  if (!storedSession || !user || user.sessionVersion !== token.sessionVersion || !roles.includes(user.role)) {
    return null;
  }
  const lastSeenAt = storedSession.lastSeenAt instanceof Date ? storedSession.lastSeenAt : new Date(0);
  if (Date.now() - lastSeenAt.getTime() > 5 * 60 * 1000) {
    void database.collection("sessions").updateOne({ sessionId: token.sessionId }, { $set: { lastSeenAt: new Date() } }).catch(() => undefined);
  }

  return {
    ...token,
    name: String(user.name),
    email: String(user.email),
    role: user.role as Role,
  };
}

export async function requireSession(allowedRoles?: Role[]) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (allowedRoles && !allowedRoles.includes(session.role)) redirect("/dashboard?error=forbidden");
  return session;
}

export async function destroySession() {
  const token = await readToken();
  if (token) {
    await (await db()).collection("sessions").updateOne(
      { sessionId: token.sessionId },
      { $set: { revokedAt: new Date() } },
    );
  }
  (await cookies()).delete(SESSION_COOKIE);
}
