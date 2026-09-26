'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DesignSides, Layer, PrintMethod, Side, SizeQuantity } from './types';

export interface CartLine {
  lineId: string;
  productId: string;
  productName: string;
  variantId: string;
  colourName: string;
  colourHex: string;
  garmentPath: string;
  area: { width: number; height: number };
  printMethod: PrintMethod;
  sizes: SizeQuantity[];
  /** A frozen copy of the layers at add-to-cart time, never a live reference. */
  designSides: DesignSides;
  designPublicId: string | null;
}

interface StudioState {
  productId: string | null;
  variantId: string | null;
  side: Side;
  designPublicId: string | null;
  sides: DesignSides;
  saving: boolean;
  saveError: string | null;
  lastSavedAt: string | null;

  cart: CartLine[];

  setProduct: (productId: string, variantId: string) => void;
  setVariant: (variantId: string) => void;
  setSide: (side: Side) => void;
  /** `sides: null` links an existing design without touching the editor's layers. */
  setDesign: (publicId: string, sides: DesignSides | null, variantId: string | null) => void;
  setSideLayers: (side: Side, layers: Layer[]) => void;
  beginSave: () => void;
  finishSave: (ok: boolean, message?: string) => void;

  addToCart: (line: CartLine) => void;
  updateLineSizes: (lineId: string, sizes: SizeQuantity[]) => void;
  updateLineMethod: (lineId: string, method: PrintMethod) => void;
  removeFromCart: (lineId: string) => void;
  clearCart: () => void;
  hydrated: boolean;
  markHydrated: () => void;
}

const emptySides: DesignSides = { front: [], back: [] };

export const useStudio = create<StudioState>()(
  persist(
    (set) => ({
      productId: null,
      variantId: null,
      side: 'front',
      designPublicId: null,
      sides: emptySides,
      saving: false,
      saveError: null,
      lastSavedAt: null,
      cart: [],
      hydrated: false,

      setProduct: (productId, variantId) =>
        set({
          productId,
          variantId,
          // Switching product type starts a fresh design (PRD A9 / C9).
          sides: { front: [], back: [] },
          designPublicId: null,
          side: 'front',
          lastSavedAt: null,
          saveError: null,
        }),

      setVariant: (variantId) => set({ variantId }),

      setSide: (side) => set({ side }),

      setDesign: (publicId, sides, variantId) =>
        set((state) => ({
          designPublicId: publicId,
          sides: sides ?? state.sides,
          variantId: variantId ?? state.variantId,
        })),

      setSideLayers: (side, layers) =>
        set((state) => ({ sides: { ...state.sides, [side]: layers } })),

      beginSave: () => set({ saving: true, saveError: null }),
      finishSave: (ok, message) =>
        set({
          saving: false,
          saveError: ok ? null : (message ?? 'Save failed'),
          lastSavedAt: ok ? new Date().toISOString() : null,
        }),

      addToCart: (line) => set((state) => ({ cart: [...state.cart, line] })),

      updateLineSizes: (lineId, sizes) =>
        set((state) => ({
          cart: state.cart.map((line) => (line.lineId === lineId ? { ...line, sizes } : line)),
        })),

      updateLineMethod: (lineId, printMethod) =>
        set((state) => ({
          cart: state.cart.map((line) => (line.lineId === lineId ? { ...line, printMethod } : line)),
        })),

      removeFromCart: (lineId) =>
        set((state) => ({ cart: state.cart.filter((line) => line.lineId !== lineId) })),

      clearCart: () => set({ cart: [] }),

      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'sg_studio_v1',
      storage: createJSONStorage(() => localStorage),
      // Only the cart is persisted. Editor state is per-visit unless saved server-side.
      partialize: (state) => ({ cart: state.cart }) as unknown as StudioState,
      skipHydration: true,
    },
  ),
);

export function useCartCount(): number {
  return useStudio((state) => state.cart.reduce((sum, line) => sum + line.sizes.reduce((s, x) => s + x.qty, 0), 0));
}
