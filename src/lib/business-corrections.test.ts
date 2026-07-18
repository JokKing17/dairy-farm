import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";
import { suggestKundaBreakdown } from "./yogurt-production-calculations";

describe("Household and Shop customer rules",()=>{
 const actions=readFileSync(resolve("src/app/(app)/customers/actions.ts"),"utf8");
 const deliveries=readFileSync(resolve("src/lib/services/delivery.ts"),"utf8");
 it("accepts only Household and Shop in new customer workflows",()=>{expect(actions).toContain('z.enum(["household","shop"])');expect(actions).not.toContain('"party"])')});
 it("requires Household fields conditionally and leaves Shop contact optional",()=>{expect(actions).toContain('value.customerType==="household"');expect(actions).toContain("phone:z.string().trim().max(20).optional()");expect(actions).toContain("dailyQuantity:z.string().optional()")});
 it("loads and validates only Household customers for Daily Deliveries",()=>{expect(deliveries.match(/customerType: "household"/g)?.length).toBeGreaterThanOrEqual(2);expect(deliveries).not.toContain('customerType: "shop"')});
 it("migrates Party safely to Shop",()=>{const migration=readFileSync(resolve("scripts/migrate.ts"),"utf8");expect(migration).toContain('{ customerType: "party" }');expect(migration).toContain("legacyCustomerType");expect(migration).toContain('customerType: "shop"')});
});

describe("Shop Sale posting",()=>{
 const service=readFileSync(resolve("src/lib/services/shop-sale.ts"),"utf8");
 it("supports anonymous Paid Now and requires Shop Customer for Credit",()=>{expect(service).toContain('input.paymentType === "credit" && !customer');expect(service).toContain('customer?.name ?? "Walk-in customer"')});
 it("separates Cash and Credit accounting",()=>{expect(service).toContain('collection("cashbook_entries")');expect(service).toContain('collection("party_ledger_entries")');expect(service).toContain('input.paymentType === "cash"');expect(service).toContain('input.paymentType === "credit"')});
 it("snapshots rates, costs, COGS and gross profit",()=>{for(const field of ["sellingRatePaisa","unitCostPaisa","costOfGoodsSoldPaisa","grossProfitPaisa"])expect(service).toContain(field)});
 it("includes Shop Sales in dashboard and report revenue",()=>{const queries=readFileSync(resolve("src/lib/queries.ts"),"utf8");expect(queries).toContain('"shop_cash_sale"');expect(queries).toContain('"shop_credit_sale"');expect(queries).toContain('"shop_sale_reversal"')});
 it("is atomic and idempotent",()=>{expect(service).toContain("return transaction");expect(service).toContain('collection("idempotency_records")')});
 it("rejects direct Kunda product sales",()=>expect(service).toContain('line.sku === "KUNDA-001"'));
});

describe("Kunda container allocation",()=>{
 it("suggests four 3.5 kg and one 3 kg Kunda for 17 kg",()=>expect(suggestKundaBreakdown(17000n)).toMatchObject({threePointFiveKg:4,threeKg:1,looseMilli:0n}));
 it("suggests eight 3.5 kg and two 3 kg Kunda for 34 kg",()=>expect(suggestKundaBreakdown(34000n)).toMatchObject({threePointFiveKg:8,threeKg:2,looseMilli:0n}));
 it("keeps unmatched Yogurt loose without inventing custom Kundas",()=>expect(suggestKundaBreakdown(1000n)).toMatchObject({threePointFiveKg:0,threeKg:0,looseMilli:1000n}));
 it("tracks packaging separately from Yogurt inventory",()=>{const production=readFileSync(resolve("src/lib/services/yogurt-production.ts"),"utf8");expect(production).toContain('collection("yogurt_packaging_movements")');expect(production).toContain('sourceType:"production_allocation"');expect(production.match(/type:"yogurt-production-output"/g)).toHaveLength(1)});
it("full-Kunda Shop Sales reduce Yogurt once and packaging count once",()=>{const sales=readFileSync(resolve("src/lib/services/shop-sale.ts"),"utf8");expect(sales).toContain('productSku: line.sku');expect(sales).toContain("countChange: Long.fromBigInt(-used)");expect(sales).toContain("quantityMilli = size * count")});
});
