/**
 * Catalogue constants shared by the seed script (server) and the preview (browser).
 * Deliberately free of any server-only import so it can be bundled for the client.
 *
 * Product set follows PRD A1: crew and oversized ship; polo is undecided (C1) and
 * hoodies/caps are "if time allows", so none of the three are seeded.
 */

export const GARMENT_WIDTH = 640;
export const GARMENT_HEIGHT = 800;

export const GARMENT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

export interface SeedColour {
  name: string;
  hex: string;
}

export const SEED_COLOURS: SeedColour[] = [
  { name: 'Optic White', hex: '#f7f7f5' },
  { name: 'Jet Black', hex: '#16181d' },
  { name: 'Navy', hex: '#1e2a44' },
  { name: 'Sand', hex: '#d8c6a5' },
  { name: 'Sage', hex: '#a9b79b' },
];

export interface SeedProduct {
  slug: string;
  name: string;
  garmentType: string;
  basePricePaise: number;
  description: string;
  /** Provisional print area until D4 supplies print-floor dimensions (C10). */
  front: { x: number; y: number; width: number; height: number };
}

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    slug: 'classic-crew-tee',
    name: 'Classic Crew T-Shirt',
    garmentType: 'crew',
    basePricePaise: 49900,
    description: '180 GSM combed cotton crew neck. Unisex fit.',
    front: { x: 170, y: 150, width: 300, height: 380 },
  },
  {
    slug: 'oversized-tee',
    name: 'Oversized T-Shirt',
    garmentType: 'oversized',
    basePricePaise: 59900,
    description: '240 GSM heavyweight cotton, dropped shoulder, boxy fit.',
    front: { x: 150, y: 165, width: 340, height: 400 },
  },
];

/** Provisional bulk tiers. D3 must replace these with the real price sheet. */
export const SEED_TIERS: { slug: string; minQty: number; unitPricePaise: number }[] = [
  { slug: 'classic-crew-tee', minQty: 1, unitPricePaise: 49900 },
  { slug: 'classic-crew-tee', minQty: 10, unitPricePaise: 42900 },
  { slug: 'classic-crew-tee', minQty: 50, unitPricePaise: 37900 },
  { slug: 'oversized-tee', minQty: 1, unitPricePaise: 59900 },
  { slug: 'oversized-tee', minQty: 10, unitPricePaise: 52900 },
  { slug: 'oversized-tee', minQty: 50, unitPricePaise: 46900 },
];

export function variantIdFor(slug: string, colourName: string): string {
  return `${slug}--${colourName.toLowerCase().replace(/\s+/g, '-')}`;
}
