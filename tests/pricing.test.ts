import { describe, expect, it } from 'vitest';
import { priceFor, sumSizeQuantities } from '@/lib/pricing';
import type { PriceTier } from '@/lib/types';

const tiers: PriceTier[] = [
  { id: 't1', productId: 'p1', variantId: null, printMethod: null, minQty: 1, unitPricePaise: 49900, provisional: true },
  { id: 't10', productId: 'p1', variantId: null, printMethod: null, minQty: 10, unitPricePaise: 42900, provisional: true },
  { id: 't50', productId: 'p1', variantId: null, printMethod: null, minQty: 50, unitPricePaise: 37900, provisional: true },
];

describe('priceFor', () => {
  it('uses the tier that the quantity has reached', () => {
    expect(priceFor(tiers, { productId: 'p1', variantId: 'v1', printMethod: 'DTF', quantity: 1, basePricePaise: 99900 }).unitPricePaise).toBe(49900);
    expect(priceFor(tiers, { productId: 'p1', variantId: 'v1', printMethod: 'DTF', quantity: 9, basePricePaise: 99900 }).unitPricePaise).toBe(49900);
  });

  it('crosses the breakpoint exactly at 10 and 50', () => {
    expect(priceFor(tiers, { productId: 'p1', variantId: null, printMethod: 'DTF', quantity: 10, basePricePaise: 99900 }).unitPricePaise).toBe(42900);
    expect(priceFor(tiers, { productId: 'p1', variantId: null, printMethod: 'DTF', quantity: 49, basePricePaise: 99900 }).unitPricePaise).toBe(42900);
    expect(priceFor(tiers, { productId: 'p1', variantId: null, printMethod: 'DTF', quantity: 50, basePricePaise: 99900 }).unitPricePaise).toBe(37900);
  });

  it('computes subtotal from its own quantity, not a supplied one', () => {
    const result = priceFor(tiers, { productId: 'p1', variantId: null, printMethod: 'DTF', quantity: 12, basePricePaise: 99900 });
    expect(result.quantity).toBe(12);
    expect(result.subtotalPaise).toBe(42900 * 12);
  });

  it('falls back to base price, flagged provisional, when no tier matches', () => {
    const result = priceFor([], { productId: 'p1', variantId: null, printMethod: 'DTF', quantity: 2, basePricePaise: 49900 });
    expect(result.unitPricePaise).toBe(49900);
    expect(result.tierId).toBe('base');
    expect(result.provisional).toBe(true);
  });

  it('prefers a colour-specific tier over a generic one at the same quantity', () => {
    const withColour: PriceTier[] = [
      ...tiers,
      { id: 'navy', productId: 'p1', variantId: 'navy', printMethod: null, minQty: 1, unitPricePaise: 45900, provisional: true },
    ];
    const result = priceFor(withColour, { productId: 'p1', variantId: 'navy', printMethod: 'DTF', quantity: 3, basePricePaise: 99900 });
    expect(result.unitPricePaise).toBe(45900);
    expect(result.tierId).toBe('navy');
  });

  it('does not apply a colour tier to a different colour', () => {
    const withColour: PriceTier[] = [
      { id: 'navy', productId: 'p1', variantId: 'navy', printMethod: null, minQty: 1, unitPricePaise: 45900, provisional: true },
    ];
    const result = priceFor(withColour, { productId: 'p1', variantId: 'white', printMethod: 'DTF', quantity: 3, basePricePaise: 49900 });
    expect(result.unitPricePaise).toBe(49900);
  });
});

describe('sumSizeQuantities', () => {
  it('adds a size grid up', () => {
    expect(sumSizeQuantities([{ qty: 10 }, { qty: 25 }, { qty: 5 }])).toBe(40);
  });
});
