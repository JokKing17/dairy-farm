export const roles=["owner","manager","accountant","cashier","delivery"] as const;
export type Role=typeof roles[number];
export type Audit={createdAt:Date;createdBy:string;updatedAt:Date;updatedBy:string};
export type Product={name:string;sku:string;unit:string;category:string;active:boolean;stockMilli:bigint;averageCostPaisa:bigint;retailRatePaisa:bigint};
