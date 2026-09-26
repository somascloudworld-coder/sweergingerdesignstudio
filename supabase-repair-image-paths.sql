-- ============================================================
-- REPAIR: garment image paths for a project seeded before they moved
--
-- WHY THIS EXISTS
-- An earlier version of supabase-setup.sql seeded image_path as
-- '/api/media/garments/....png'. That route reads the app's local data folder, which
-- does not exist on a deployed host, so every garment image renders broken.
--
-- Re-running supabase-setup.sql does NOT fix it: every insert there ends in
-- "on conflict do nothing", which is correct for a first run and useless for a repair.
-- That is the whole point of this file.
--
-- RUN: Supabase project -> SQL Editor -> New query -> paste this file -> Run.
-- Safe to run more than once.
-- ============================================================

-- Garment art ships with the app in public/garments/, named after the variant id.
update public.product_variants
   set image_path = '/garments/' || id || '.png'
 where image_path is distinct from '/garments/' || id || '.png';

-- Each product's own image is its first colour's garment.
update public.products p
   set image_path = '/garments/' || v.id || '.png'
  from public.product_variants v
 where v.product_id = p.id
   and v.sort = 0
   and p.image_path is distinct from '/garments/' || v.id || '.png';

-- Confirm: expect 10 rows, every image_path starting with /garments/.
select p.slug  as product,
       v.sort  as position,
       v.id    as variant_id,
       v.image_path
  from public.products p
  join public.product_variants v on v.product_id = p.id
 order by p.slug, v.sort;

-- If any row still does not start with /garments/, the file for that variant id is
-- missing from public/garments/ in the deployed build. Check the deployment is the
-- commit that added it, then open:
--   https://<your-deployment>/garments/<variant_id>.png     -> should be a T-shirt image
--   https://<your-deployment>/api/health                    -> should say "products": 2
