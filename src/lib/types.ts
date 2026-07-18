export const roles=["owner","manager","accountant","cashier","delivery"] as const;
export type Role=typeof roles[number];
export type Audit={createdAt:Date;createdBy:string;updatedAt:Date;updatedBy:string};
export type Product={name:string;sku:string;unit:string;category:string;active:boolean;inventoryManaged:boolean;allowManualStockReceipt:boolean;sellable:boolean;availableInDailyDelivery:boolean;internalOnly:boolean;stockMilli:bigint;averageCostPaisa:bigint;retailRatePaisa:bigint;pieceSellingRatePaisa?:bigint;traySellingRatePaisa?:bigint;piecesPerTray?:number;defaultSaleUnit?:"piece"|"tray";purchaseUnit?:string;saleUnits?:string[];stockSource?:string;lowStockMilli?:bigint;eggInventoryUnitVersion?:number};
