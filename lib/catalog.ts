import catalog from './catalog.json';

/**
 * Catalogue constants shared by the seed script (server), the garment-art build step and
 * the preview (browser). The data lives in `catalog.json` so the plain Node build script
 * and the TypeScript app read one source, never two.
 *
 * Deliberately free of any server-only import so it can be bundled for the client.
 *
 * Product set follows PRD A1: crew and oversized ship; polo is undecided (C1) and
 * hoodies/caps are "if time allows", so none of the three are seeded.
 */

export const GARMENT_WIDTH: number = catalog.garmentWidth;
export const GARMENT_HEIGHT: number = catalog.garmentHeight;

export const GARMENT_SIZES: string[] = catalog.sizes;

export interface SeedColour {
  name: string;
  hex: string;
}

export interface SeedProduct {
  slug: string;
  name: string;
  garmentType: string;
  basePricePaise: number;
  description: string;
  /** Provisional print area until D4 supplies print-floor dimensions (C10). */
  front: { x: number; y: number; width: number; height: number };
}

export interface SeedTier {
  slug: string;
  minQty: number;
  unitPricePaise: number;
}

export const SEED_COLOURS: SeedColour[] = catalog.colours;
export const SEED_PRODUCTS: SeedProduct[] = catalog.products;
/** Provisional bulk tiers. D3 must replace these with the real price sheet. */
export const SEED_TIERS: SeedTier[] = catalog.tiers;

export function variantIdFor(slug: string, colourName: string): string {
  return `${slug}--${colourName.toLowerCase().replace(/\s+/g, '-')}`;
}

/**
 * Garment art is served from `public/`, not from the writable-data folder: it is product
 * configuration, not user data, so it must survive a serverless deploy and a cold start.
 * `scripts/build-garments.mjs` writes these files for every product x colour.
 */
export function garmentImagePath(slug: string, colourName: string): string {
  return `/garments/${variantIdFor(slug, colourName)}.png`;
}
