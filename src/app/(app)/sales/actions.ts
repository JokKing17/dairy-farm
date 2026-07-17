"use server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { postShopSale,reverseShopSale,shopSaleSchema } from "@/lib/services/shop-sale";
export type ShopSaleState={error?:string;result?:{transactionNo:string;totalPaisa:string;grossProfitPaisa:string}};
export async function createShopSale(_:ShopSaleState,data:FormData):Promise<ShopSaleState>{const actor=await requireSession(["owner","manager","cashier"]);try{const raw=JSON.parse(String(data.get("payload")||"{}")),parsed=shopSaleSchema.safeParse(raw);if(!parsed.success)return{error:parsed.error.issues[0]?.message??"Check the Shop Sale."};const result=await postShopSale(parsed.data,actor.userId) as ShopSaleState["result"];revalidatePath("/sales");revalidatePath("/inventory");revalidatePath("/customers");revalidatePath("/cashbook");return{result};}catch(error){return{error:error instanceof Error?error.message:"Shop Sale could not be posted."};}}
export async function reverseSale(_:ActionState,data:FormData):Promise<ActionState>{const actor=await requireSession(["owner"]);try{const transactionNo=String(data.get("transactionNo")||""),reason=String(data.get("reason")||"");const result=await reverseShopSale(transactionNo,reason,actor.userId);for(const path of ["/sales","/inventory","/customers","/cashbook"])revalidatePath(path);return{success:`Reversed as ${result.reversalNo}`};}catch(error){return{error:error instanceof Error?error.message:"Shop Sale could not be reversed."};}}
export type ActionState={error?:string;success?:string};
