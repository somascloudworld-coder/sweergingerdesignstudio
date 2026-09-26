// Domain model for the Sweet Ginger T-Shirt Design Studio.
// The design's source of truth is structured layer JSON, never a flattened image
// (IMPLEMENTATION-PLAN "Decisions most expensive to reverse").

export type Side = 'front' | 'back';
export type PrintMethod = 'DTF' | 'VINYL' | 'EMBROIDERY';
export type OrderType = 'B2C' | 'B2B';
export type OrderStatus = 'draft' | 'placed' | 'in_production' | 'printed' | 'shipped' | 'cancelled';

/** Money is always integer paise. No floats in the money path. */
export type Paise = number;

export interface Product {
  id: string;
  slug: string;
  name: string;
  garmentType: string;
  basePricePaise: Paise;
  description: string;
  imagePath: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  colourName: string;
  colourHex: string;
  /** Garment photography for this colour, in garment coordinate space. */
  imagePath: string;
  sort: number;
}

export interface PrintArea {
  id: string;
  productId: string;
  side: Side;
  /** Print boundary in garment coordinate space (origin top-left of the garment image). */
  x: number;
  y: number;
  width: number;
  height: number;
  units: 'px';
  /** True until D4 supplies real print-floor dimensions. Never treated as final. */
  provisional: boolean;
  note?: string;
}

export interface BaseLayer {
  id: string;
  type: 'text' | 'image';
  /** Centre of the element, in print-area local coordinates (0..area.width, 0..area.height). */
  x: number;
  y: number;
  /** Untransformed box dimensions in px. */
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  /** Degrees, clockwise. */
  angle: number;
  z: number;
}

export interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
}

export interface ImageLayer extends BaseLayer {
  type: 'image';
  assetId: string;
  opacity: number;
}

export type Layer = TextLayer | ImageLayer;

export interface DesignSides {
  front: Layer[];
  back: Layer[];
}

export interface Design {
  publicId: string;
  productId: string;
  variantId: string;
  sides: DesignSides;
  createdAt: string;
  updatedAt: string;
}

export interface DesignElementRow {
  id: string;
  designPublicId: string;
  layerId: string;
  elementType: 'text' | 'image';
  side: Side;
  z: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  textContent: string | null;
  assetId: string | null;
  fontFamily: string | null;
  fontSize: number | null;
}

export interface PriceTier {
  id: string;
  productId: string;
  /** null = applies to every colour of the product. */
  variantId: string | null;
  /** null = applies to every print method. */
  printMethod: PrintMethod | null;
  minQty: number;
  unitPricePaise: Paise;
  /** True until D3 supplies the real bulk price sheet. */
  provisional: boolean;
}

export interface PriceBreakdown {
  unitPricePaise: Paise;
  quantity: number;
  subtotalPaise: Paise;
  tierId: string;
  provisional: boolean;
}

export interface SizeQuantity {
  size: string;
  qty: number;
}

/** One frozen, orderable line: a design snapshot plus its garment configuration. */
export interface OrderLineInput {
  productId: string;
  variantId: string;
  colourName: string;
  printMethod: PrintMethod;
  /** Size -> quantity. B2C is one entry; B2B is the size grid. Same shape either way. */
  sizes: SizeQuantity[];
  /** A frozen copy of the design layers at the moment it was added. */
  designSides: DesignSides;
  designPublicId: string | null;
}

export interface OrderLine extends OrderLineInput {
  id: string;
  orderId: string;
  unitPricePaise: Paise;
  quantity: number;
  lineTotalPaise: Paise;
}

export interface CustomerDetails {
  name: string;
  phone: string;
  email: string;
  address: string;
  company?: string;
  gstin?: string;
}

export interface Order {
  id: string;
  publicId: string;
  orderType: OrderType;
  customer: CustomerDetails;
  status: OrderStatus;
  paymentStatus: 'unpaid' | 'placeholder_pending' | 'paid';
  /** How the priced order was handed off. D6 unresolved -> placeholder. */
  checkoutHandoff: string;
  subtotalPaise: Paise;
  totalPaise: Paise;
  lines: OrderLine[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderStatusEvent {
  id: string;
  orderId: string;
  status: OrderStatus;
  note: string | null;
  staffEmail: string | null;
  createdAt: string;
}

export interface PrintOutput {
  id: string;
  orderItemId: string;
  side: Side;
  printMethod: PrintMethod;
  format: 'png';
  widthPx: number;
  heightPx: number;
  dpi: number;
  provisional: boolean;
  /** For EMBROIDERY: captured intent for manual digitizing, never an auto stitch file. */
  manualDigitizingRequired: boolean;
  createdAt: string;
}

export interface ProductWithDetails extends Product {
  variants: ProductVariant[];
  printAreas: PrintArea[];
}
