import { Studio } from '@/components/Studio';
import { SetupNeeded } from '@/components/states';
import { getRepo } from '@/lib/db';
import type { Design, ProductWithDetails } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ design?: string }>;
}) {
  const { design: designId } = await searchParams;

  let products: ProductWithDetails[] = [];
  let initialDesign: Design | null = null;

  try {
    const repo = await getRepo();
    products = await repo.listProducts();
    if (designId) initialDesign = await repo.getDesign(designId);
  } catch (error) {
    return <SetupNeeded detail={error instanceof Error ? error.message : String(error)} />;
  }

  if (products.length === 0) {
    return <SetupNeeded detail="The catalogue is empty — no products are seeded." />;
  }

  return (
    <div className="wrap">
      <Studio products={products} initialDesign={initialDesign} />
    </div>
  );
}
