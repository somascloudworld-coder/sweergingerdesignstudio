'use client';

import { useEffect } from 'react';
import { useStudio } from '@/lib/store';

/** Rehydrates the persisted cart after mount, so server and first client render agree. */
export function StoreHydrator() {
  useEffect(() => {
    void useStudio.persist.rehydrate();
    useStudio.getState().markHydrated();
  }, []);
  return null;
}
