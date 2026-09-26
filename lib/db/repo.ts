import type {
  Design,
  DesignSides,
  Order,
  OrderStatus,
  Paise,
  PriceTier,
  PrintMethod,
  PrintOutput,
  ProductWithDetails,
  SizeQuantity,
} from '../types';

export interface AssetRecord {
  id: string;
  designPublicId: string | null;
  originalName: string;
  mime: string;
  filePath: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
}

export interface StaffUser {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
}

export interface CreateDesignInput {
  productId: string;
  variantId: string;
  sides?: DesignSides;
}

export interface CreateOrderLineInput {
  productId: string;
  variantId: string;
  colourName: string;
  printMethod: PrintMethod;
  sizes: SizeQuantity[];
  designSides: DesignSides;
  designPublicId: string | null;
  unitPricePaise: Paise;
  quantity: number;
  lineTotalPaise: Paise;
}

export interface CreateOrderInput {
  orderType: 'B2C' | 'B2B';
  customer: {
    name: string;
    phone: string;
    email: string;
    address: string;
    company?: string;
    gstin?: string;
  };
  checkoutHandoff: string;
  subtotalPaise: Paise;
  totalPaise: Paise;
  lines: CreateOrderLineInput[];
}

export interface CreatePrintOutputInput {
  orderItemId: string;
  side: 'front' | 'back';
  printMethod: PrintMethod;
  format: 'png';
  widthPx: number;
  heightPx: number;
  dpi: number;
  provisional: boolean;
  manualDigitizingRequired: boolean;
  filePath: string;
}

export interface CreateAssetInput {
  designPublicId: string | null;
  originalName: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  data: Buffer;
}

/**
 * One repository interface, two implementations (SQLite locally, Supabase Postgres in
 * production). Business rules never live here; this is storage only.
 */
export interface Repo {
  listProducts(): Promise<ProductWithDetails[]>;
  getProduct(idOrSlug: string): Promise<ProductWithDetails | null>;
  listPriceTiers(productId: string): Promise<PriceTier[]>;

  createDesign(input: CreateDesignInput): Promise<Design>;
  getDesign(publicId: string): Promise<Design | null>;
  saveDesign(publicId: string, sides: DesignSides, variantId: string): Promise<Design>;

  createAsset(input: CreateAssetInput): Promise<AssetRecord>;
  getAsset(id: string): Promise<AssetRecord | null>;
  readAssetData(asset: AssetRecord): Promise<Buffer>;

  createOrder(input: CreateOrderInput): Promise<Order>;
  listOrders(): Promise<Order[]>;
  getOrder(publicId: string): Promise<Order | null>;
  advanceStatus(
    orderPublicId: string,
    status: OrderStatus,
    note: string | null,
    staffEmail: string | null,
  ): Promise<Order>;

  /**
   * Persists a generated print file and returns the handle to store on the
   * print_outputs row. Local backend: an absolute path on disk. Supabase backend: an
   * object key in the `studio` bucket. Never let a route write to disk directly: the
   * filesystem is not writable on a serverless host.
   */
  writePrintOutputFile(key: string, data: Buffer, mime: string): Promise<string>;

  addPrintOutput(input: CreatePrintOutputInput): Promise<PrintOutput>;
  getPrintOutput(id: string): Promise<PrintOutput | null>;
  listPrintOutputsForItem(orderItemId: string): Promise<PrintOutput[]>;
  readPrintOutputData(id: string): Promise<Buffer | null>;

  findStaff(email: string): Promise<StaffUser | null>;
}
