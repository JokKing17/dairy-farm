export type ProductCatalogEntry = {
  sku: string;
  name: string;
  unit: string;
  category: string;
  active?: boolean;
  inventoryManaged?: boolean;
  allowManualStockReceipt?: boolean;
  sellable?: boolean;
  availableInDailyDelivery?: boolean;
  internalOnly?: boolean;
  stockSource?: string;
  baseUnit?: string;
  purchaseUnit?: string;
  saleUnits?: string[];
  piecesPerTray?: number;
  defaultSaleUnit?: "piece" | "tray";
  pieceSellingRatePaisa?: number;
  traySellingRatePaisa?: number;
  retailRatePaisa?: number;
  lowStockMilli?: number;
  variantGroup?: string;
  variantName?: string;
  parentSku?: string;
};

export function getDefaultProductCatalog(): ProductCatalogEntry[] {
  return [
    {
      sku: "MILK-001",
      name: "Fresh Milk",
      unit: "liter",
      category: "dairy",
      retailRatePaisa: 20000,
      active: true,
      inventoryManaged: true,
      allowManualStockReceipt: false,
      sellable: true,
      availableInDailyDelivery: false,
      internalOnly: false,
      stockSource: "vendor-procurement",
      lowStockMilli: 5000,
    },
    {
      sku: "YOG-001",
      name: "Yogurt / Dahi",
      unit: "kilogram",
      category: "dairy",
      retailRatePaisa: 24000,
      active: true,
      inventoryManaged: true,
      allowManualStockReceipt: false,
      sellable: true,
      availableInDailyDelivery: true,
      internalOnly: false,
      stockSource: "yogurt-production",
      lowStockMilli: 5000,
    },
    {
      sku: "BREAD-001",
      name: "Bread",
      unit: "packet",
      category: "bread",
      retailRatePaisa: 0,
      active: true,
      inventoryManaged: true,
      allowManualStockReceipt: true,
      sellable: true,
      availableInDailyDelivery: true,
      internalOnly: false,
      stockSource: "inventory-receipt",
      lowStockMilli: 0,
      variantGroup: "bread",
      variantName: "standard",
    },
    {
      sku: "BREAD-001-SMALL",
      name: "Bread · Small",
      unit: "packet",
      category: "bread",
      retailRatePaisa: 0,
      active: true,
      inventoryManaged: true,
      allowManualStockReceipt: true,
      sellable: true,
      availableInDailyDelivery: true,
      internalOnly: false,
      stockSource: "inventory-receipt",
      lowStockMilli: 0,
      variantGroup: "bread",
      variantName: "small",
      parentSku: "BREAD-001",
    },
    {
      sku: "BREAD-001-MEDIUM",
      name: "Bread · Medium",
      unit: "packet",
      category: "bread",
      retailRatePaisa: 0,
      active: true,
      inventoryManaged: true,
      allowManualStockReceipt: true,
      sellable: true,
      availableInDailyDelivery: true,
      internalOnly: false,
      stockSource: "inventory-receipt",
      lowStockMilli: 0,
      variantGroup: "bread",
      variantName: "medium",
      parentSku: "BREAD-001",
    },
    {
      sku: "BREAD-001-LARGE",
      name: "Bread · Large",
      unit: "packet",
      category: "bread",
      retailRatePaisa: 0,
      active: true,
      inventoryManaged: true,
      allowManualStockReceipt: true,
      sellable: true,
      availableInDailyDelivery: true,
      internalOnly: false,
      stockSource: "inventory-receipt",
      lowStockMilli: 0,
      variantGroup: "bread",
      variantName: "large",
      parentSku: "BREAD-001",
    },
    {
      sku: "BAND-SMALL",
      name: "Band · Small",
      unit: "packet",
      category: "band",
      retailRatePaisa: 0,
      active: true,
      inventoryManaged: true,
      allowManualStockReceipt: true,
      sellable: true,
      availableInDailyDelivery: true,
      internalOnly: false,
      stockSource: "inventory-receipt",
      lowStockMilli: 0,
      variantGroup: "band",
      variantName: "small",
    },
    {
      sku: "BAND-LARGE",
      name: "Band · Large",
      unit: "packet",
      category: "band",
      retailRatePaisa: 0,
      active: true,
      inventoryManaged: true,
      allowManualStockReceipt: true,
      sellable: true,
      availableInDailyDelivery: true,
      internalOnly: false,
      stockSource: "inventory-receipt",
      lowStockMilli: 0,
      variantGroup: "band",
      variantName: "large",
    },
    {
      sku: "BAKARKHANI-001",
      name: "Bakarkhani",
      unit: "packet",
      category: "bakery",
      retailRatePaisa: 0,
      active: true,
      inventoryManaged: true,
      allowManualStockReceipt: true,
      sellable: true,
      availableInDailyDelivery: true,
      internalOnly: false,
      stockSource: "inventory-receipt",
      lowStockMilli: 0,
    },
    {
      sku: "EGG-001",
      name: "Eggs",
      unit: "piece",
      category: "retail",
      retailRatePaisa: 0,
      active: true,
      inventoryManaged: true,
      allowManualStockReceipt: true,
      sellable: true,
      availableInDailyDelivery: true,
      internalOnly: false,
      stockSource: "inventory-receipt",
      baseUnit: "piece",
      purchaseUnit: "tray",
      saleUnits: ["piece", "tray"],
      piecesPerTray: 30,
      defaultSaleUnit: "piece",
      pieceSellingRatePaisa: 0,
      traySellingRatePaisa: 0,
      lowStockMilli: 0,
    },
    {
      sku: "ISPAGHOL-001",
      name: "Ispaghol Husk Packets",
      unit: "packet",
      category: "retail",
      retailRatePaisa: 0,
      active: true,
      inventoryManaged: true,
      allowManualStockReceipt: true,
      sellable: true,
      availableInDailyDelivery: true,
      internalOnly: false,
      stockSource: "inventory-receipt",
      lowStockMilli: 0,
    },
    {
      sku: "KUNDA-001",
      name: "Kunda Dahi",
      unit: "pot",
      category: "internal",
      active: true,
      inventoryManaged: false,
      allowManualStockReceipt: false,
      sellable: false,
      availableInDailyDelivery: false,
      internalOnly: true,
    },
    {
      sku: "GL-001",
      name: "Gold Leaf",
      unit: "packet",
      category: "disabled",
      active: false,
      inventoryManaged: false,
      allowManualStockReceipt: false,
      sellable: false,
      availableInDailyDelivery: false,
      internalOnly: false,
    },
  ];
}

export function getManualReceiptSkus(): string[] {
  return getDefaultProductCatalog()
    .filter((product) => product.allowManualStockReceipt)
    .map((product) => product.sku);
}

export function getDailyDeliveryCatalogSkus(): string[] {
  return getDefaultProductCatalog()
    .filter((product) => product.availableInDailyDelivery && product.inventoryManaged && product.sellable)
    .map((product) => product.sku);
}

export function getProductCatalogBySku(sku: string): ProductCatalogEntry | undefined {
  return getDefaultProductCatalog().find((product) => product.sku === sku);
}
