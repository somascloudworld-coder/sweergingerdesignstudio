import { z } from 'zod';

/** Shared between browser and server (TECH-STACK section 1: Zod). */

const finiteNumber = z.number().finite();
const positiveNumber = z.number().finite().positive();

const baseLayerFields = {
  id: z.string().min(1).max(80),
  x: finiteNumber,
  y: finiteNumber,
  width: positiveNumber.max(20000),
  height: positiveNumber.max(20000),
  scaleX: finiteNumber,
  scaleY: finiteNumber,
  angle: finiteNumber,
  z: finiteNumber,
};

export const textLayerSchema = z.object({
  ...baseLayerFields,
  type: z.literal('text'),
  text: z.string().min(1).max(400),
  fontFamily: z.string().min(1).max(120),
  fontSize: positiveNumber.max(1000),
  fill: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a hex value.'),
  fontWeight: z.enum(['normal', 'bold']),
  fontStyle: z.enum(['normal', 'italic']),
  textAlign: z.enum(['left', 'center', 'right']),
});

export const imageLayerSchema = z.object({
  ...baseLayerFields,
  type: z.literal('image'),
  assetId: z.string().min(1).max(80),
  opacity: z.number().min(0).max(1),
});

export const layerSchema = z.discriminatedUnion('type', [textLayerSchema, imageLayerSchema]);

export const designSidesSchema = z.object({
  front: z.array(layerSchema).max(50),
  back: z.array(layerSchema).max(50),
});

export const sizeQuantitySchema = z.object({
  size: z.string().min(1).max(20),
  qty: z.number().int().min(0).max(100000),
});

export const printMethodSchema = z.enum(['DTF', 'VINYL', 'EMBROIDERY']);

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'Name is required.').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, 'A phone number with 7 to 15 digits is required.'),
  email: z.string().trim().email('A valid email is required.').max(200),
  address: z.string().trim().min(8, 'A delivery address is required.').max(600),
  company: z.string().trim().max(160).optional(),
  gstin: z.string().trim().max(20).optional(),
});

export const orderLineSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  printMethod: printMethodSchema,
  sizes: z.array(sizeQuantitySchema).min(1, 'Each line needs at least one size.').max(30),
  designSides: designSidesSchema,
  designPublicId: z.string().min(1).nullable().optional(),
});

export const createOrderSchema = z.object({
  orderType: z.enum(['B2C', 'B2B']),
  customer: customerSchema,
  lines: z.array(orderLineSchema).min(1, 'A cart needs at least one line.').max(50),
});

export const quoteSchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.string().optional(),
        productId: z.string().min(1),
        variantId: z.string().min(1),
        printMethod: printMethodSchema,
        sizes: z.array(sizeQuantitySchema).min(1).max(30),
      }),
    )
    .min(1)
    .max(50),
});

export const saveDesignSchema = z.object({
  variantId: z.string().min(1),
  sides: designSidesSchema,
});

export const staffLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

export const statusAdvanceSchema = z.object({
  status: z.enum(['draft', 'placed', 'in_production', 'printed', 'shipped', 'cancelled']),
  note: z.string().trim().max(300).optional(),
});

export type CreateOrderBody = z.infer<typeof createOrderSchema>;
export type QuoteBody = z.infer<typeof quoteSchema>;
