'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCartCount } from '@/lib/store';

export function CartLink() {
  const count = useCartCount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Link href="/cart">
      Cart{mounted && count > 0 ? ` (${count})` : ''}
    </Link>
  );
}
