import type { Paise, PriceBreakdown, PriceTier, PrintMethod } from './types';

export interface PriceQuery {
  productId: string;
  variantId: string | null;
  printMethod: PrintMethod;
  quantity: number;
  /** Fallback when no tier matches, e.g. the product's base price. */
  basePricePaise: Paise;
}

function specificity(tier: PriceTier): number {
  return (tier.variantId ? 2 : 0) + (tier.printMethod ? 1 : 0);
}

/**
 * The one place a unit price is decided. The browser may show an estimate, but the
 * server calls this with its own stored tiers and its own quantity (step 7).
 */
export function priceFor(tiers: PriceTier[], query: PriceQuery): PriceBreakdown {
  const quantity = Math.max(1, Math.floor(query.quantity));

  const candidates = tiers.filter((tier) => {
    if (tier.productId !== query.productId) return false;
    if (tier.variantId !== null && tier.variantId !== query.variantId) return false;
    if (tier.printMethod !== null && tier.printMethod !== query.printMethod) return false;
    return tier.minQty <= quantity;
  });

  if (candidates.length === 0) {
    return {
      unitPricePaise: query.basePricePaise,
      quantity,
      subtotalPaise: query.basePricePaise * quantity,
      tierId: 'base',
      provisional: true,
    };
  }

  candidates.sort((a, b) => {
    if (b.minQty !== a.minQty) return b.minQty - a.minQty;
    return specificity(b) - specificity(a);
  });

  const tier = candidates[0];
  return {
    unitPricePaise: tier.unitPricePaise,
    quantity,
    subtotalPaise: tier.unitPricePaise * quantity,
    tierId: tier.id,
    provisional: tier.provisional,
  };
}

export function sumSizeQuantities(sizes: { qty: number }[]): number {
  return sizes.reduce((sum, s) => sum + Math.max(0, Math.floor(s.qty)), 0);
}

export function formatPaise(paise: Paise): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
