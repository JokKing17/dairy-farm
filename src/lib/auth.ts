import "server-only";
import { cookies } from "next/headers";
import { SignJWT,jwtVerify } from "jose";
import { env } from "./env";
import type { Role } from "./types";
const key=new TextEncoder().encode(env.SESSION_SECRET);
export type Session={userId:string;name:string;role:Role};
export async function createToken(data:Session){return new SignJWT(data).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("12h").sign(key)}
export async function getSession():Promise<Session|null>{const token=(await cookies()).get("session")?.value;if(!token)return null;try{return (await jwtVerify(token,key)).payload as unknown as Session}catch{return null}}
export async function requireSession(roles?:Role[]){const s=await getSession();if(!s||roles&&!roles.includes(s.role))throw new Error("Unauthorized");return s}
