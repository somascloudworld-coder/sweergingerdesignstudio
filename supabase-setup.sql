-- ============================================================
-- SWEET GINGER DESIGN STUDIO - SUPABASE SETUP (the production path)
--
-- TECH-STACK.md section 2: managed PostgreSQL. The app reads/writes through its own
-- server routes using the service-role key; the browser never sees a secret.
--
-- HOW TO RUN:
--   Supabase project -> SQL Editor -> New query -> paste this whole file -> Run.
--
-- THEN:
--   1. Create a private Storage bucket named `studio` (this file does it).
--   2. Set these environment variables on the server (never NEXT_PUBLIC_*):
--        DATA_BACKEND=supabase
--        NEXT_PUBLIC_SUPABASE_URL=...
--        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
--        SUPABASE_SERVICE_ROLE_KEY=...
--   3. Restart the app.
--
-- IMPORTANT (Step 2 of the implementation plan): the products below are seeded with
-- PROVISIONAL print areas and placeholder garment art. Real garment photography and
-- the real print-floor dimensions (D4) and price sheet (D3) must replace them.
-- ============================================================

-- ------------------------------------------------------------ schema

create table if not exists public.products (
  id                text primary key,
  slug              text not null unique,
  name              text not null,
  garment_type      text not null,
  base_price_paise  integer not null,
  description       text not null default '',
  image_path        text not null default ''
);

create table if not exists public.product_variants (
  id          text primary key,
  product_id  text not null references public.products(id) on delete cascade,
  colour_name text not null,
  colour_hex  text not null,
  image_path  text not null default '',
  sort        integer not null default 0
);

-- Print areas are per product x side, never one universal rectangle (PRD C10 / D4).
create table if not exists public.print_areas (
  id          text primary key,
  product_id  text not null references public.products(id) on delete cascade,
  side        text not null check (side in ('front','back')),
  x           double precision not null,
  y           double precision not null,
  width       double precision not null,
  height      double precision not null,
  units       text not null default 'px',
  provisional boolean not null default true,
  note        text,
  unique (product_id, side)
);

-- The design's source of truth is structured layer JSON, never a flattened image.
create table if not exists public.designs (
  public_id   text primary key,
  product_id  text not null,
  variant_id  text not null,
  sides_json  jsonb not null default '{"front":[],"back":[]}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A relational mirror of each layer, for querying. sides_json stays authoritative.
create table if not exists public.design_elements (
  id               text primary key default gen_random_uuid()::text,
  design_public_id text not null references public.designs(public_id) on delete cascade,
  layer_id         text not null,
  element_type     text not null,
  side             text not null,
  z                double precision not null,
  x                double precision not null,
  y                double precision not null,
  width            double precision not null,
  height           double precision not null,
  scale_x          double precision not null,
  scale_y          double precision not null,
  angle            double precision not null,
  text_content     text,
  asset_id         text,
  font_family      text,
  font_size        double precision
);

-- Pricing as data, keyed to product today and built to accept colour / print method
-- without a rewrite (TECH-STACK section 9). Replace the provisional rows with D3.
create table if not exists public.price_tiers (
  id               text primary key,
  product_id       text not null,
  variant_id       text,
  print_method     text,
  min_qty          integer not null,
  unit_price_paise integer not null,
  provisional      boolean not null default true
);

create table if not exists public.assets (
  id               text primary key,
  design_public_id text,
  original_name    text not null,
  mime             text not null,
  file_path        text not null,
  width            integer not null,
  height           integer not null,
  bytes            integer not null,
  created_at       timestamptz not null default now()
);

create table if not exists public.orders (
  id                text primary key default gen_random_uuid()::text,
  public_id         text not null unique,
  order_type        text not null check (order_type in ('B2C','B2B')),
  customer_name     text not null,
  customer_phone    text not null,
  customer_email    text not null,
  customer_address  text not null,
  company           text,
  gstin             text,
  status            text not null default 'placed',
  payment_status    text not null default 'placeholder_pending',
  checkout_handoff  text not null,
  subtotal_paise    integer not null,
  total_paise       integer not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One line shape for both order types: a size -> qty map on every line.
create table if not exists public.order_items (
  id                    text primary key default gen_random_uuid()::text,
  order_id              text not null references public.orders(id) on delete cascade,
  product_id            text not null,
  variant_id            text not null,
  colour_name           text not null,
  print_method          text not null,
  design_public_id      text,
  design_snapshot_json  jsonb not null,
  unit_price_paise      integer not null,
  quantity              integer not null,
  line_total_paise      integer not null
);

create table if not exists public.order_item_sizes (
  id            text primary key default gen_random_uuid()::text,
  order_item_id text not null references public.order_items(id) on delete cascade,
  size          text not null,
  qty           integer not null
);

create table if not exists public.order_status_history (
  id          text primary key default gen_random_uuid()::text,
  order_id    text not null references public.orders(id) on delete cascade,
  status      text not null,
  note        text,
  staff_email text,
  created_at  timestamptz not null default now()
);

create table if not exists public.print_outputs (
  id                          text primary key default gen_random_uuid()::text,
  order_item_id               text not null references public.order_items(id) on delete cascade,
  side                        text not null,
  print_method                text not null,
  format                      text not null default 'png',
  width_px                    integer not null,
  height_px                   integer not null,
  dpi                         integer not null,
  provisional                 boolean not null default true,
  manual_digitizing_required  boolean not null default false,
  file_path                   text not null,
  created_at                  timestamptz not null default now()
);

create table if not exists public.admin_users (
  id            text primary key,
  email         text not null unique,
  password_hash text not null,
  role          text not null default 'admin',
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------ row level security
--
-- The app's server routes use the service-role key, which bypasses RLS. These policies
-- exist so that the publishable (anon) key can do NOTHING on these tables: even if the
-- key leaks, no customer order, design or artwork can be read through it.
-- (This is deliberately stricter than a public board: see TECH-STACK section 14.)

alter table public.products             enable row level security;
alter table public.product_variants     enable row level security;
alter table public.print_areas          enable row level security;
alter table public.designs              enable row level security;
alter table public.design_elements      enable row level security;
alter table public.price_tiers          enable row level security;
alter table public.assets               enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_item_sizes     enable row level security;
alter table public.order_status_history enable row level security;
alter table public.print_outputs        enable row level security;
alter table public.admin_users          enable row level security;

-- ------------------------------------------------------------ storage

insert into storage.buckets (id, name, public)
values ('studio', 'studio', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------ seed (provisional)

insert into public.products (id, slug, name, garment_type, base_price_paise, description, image_path) values
  ('prod_classic-crew-tee', 'classic-crew-tee', 'Classic Crew T-Shirt', 'crew', 49900,
   '180 GSM combed cotton crew neck. Unisex fit.',
   '/garments/classic-crew-tee--optic-white.png'),
  ('prod_oversized-tee', 'oversized-tee', 'Oversized T-Shirt', 'oversized', 59900,
   '240 GSM heavyweight cotton, dropped shoulder, boxy fit.',
   '/garments/oversized-tee--optic-white.png')
on conflict (id) do nothing;

insert into public.product_variants (id, product_id, colour_name, colour_hex, image_path, sort) values
  ('classic-crew-tee--optic-white', 'prod_classic-crew-tee', 'Optic White', '#f7f7f5', '/garments/classic-crew-tee--optic-white.png', 0),
  ('classic-crew-tee--jet-black',   'prod_classic-crew-tee', 'Jet Black',   '#16181d', '/garments/classic-crew-tee--jet-black.png',   1),
  ('classic-crew-tee--navy',        'prod_classic-crew-tee', 'Navy',        '#1e2a44', '/garments/classic-crew-tee--navy.png',        2),
  ('classic-crew-tee--sand',        'prod_classic-crew-tee', 'Sand',        '#d8c6a5', '/garments/classic-crew-tee--sand.png',        3),
  ('classic-crew-tee--sage',        'prod_classic-crew-tee', 'Sage',        '#a9b79b', '/garments/classic-crew-tee--sage.png',        4),
  ('oversized-tee--optic-white',    'prod_oversized-tee',    'Optic White', '#f7f7f5', '/garments/oversized-tee--optic-white.png',    0),
  ('oversized-tee--jet-black',      'prod_oversized-tee',    'Jet Black',   '#16181d', '/garments/oversized-tee--jet-black.png',      1),
  ('oversized-tee--navy',           'prod_oversized-tee',    'Navy',        '#1e2a44', '/garments/oversized-tee--navy.png',           2),
  ('oversized-tee--sand',           'prod_oversized-tee',    'Sand',        '#d8c6a5', '/garments/oversized-tee--sand.png',           3),
  ('oversized-tee--sage',           'prod_oversized-tee',    'Sage',        '#a9b79b', '/garments/oversized-tee--sage.png',           4)
on conflict (id) do nothing;

-- PROVISIONAL: replace with Ginger Prints dimensions per garment x side (D4/C10).
insert into public.print_areas (id, product_id, side, x, y, width, height, units, provisional, note) values
  ('area_classic-crew-tee_front', 'prod_classic-crew-tee', 'front', 170, 150, 300, 380, 'px', true,
   'PROVISIONAL placeholder print area - replace with Ginger Prints dimensions (D4/C10).'),
  ('area_oversized-tee_front',    'prod_oversized-tee',    'front', 150, 165, 340, 400, 'px', true,
   'PROVISIONAL placeholder print area - replace with Ginger Prints dimensions (D4/C10).')
on conflict (product_id, side) do nothing;

-- PROVISIONAL tiers: replace with the real bulk price sheet (D3/C4).
insert into public.price_tiers (id, product_id, variant_id, print_method, min_qty, unit_price_paise, provisional) values
  ('tier_crew_1',  'prod_classic-crew-tee', null, null,  1, 49900, true),
  ('tier_crew_10', 'prod_classic-crew-tee', null, null, 10, 42900, true),
  ('tier_crew_50', 'prod_classic-crew-tee', null, null, 50, 37900, true),
  ('tier_oversized_1',  'prod_oversized-tee', null, null,  1, 59900, true),
  ('tier_oversized_10', 'prod_oversized-tee', null, null, 10, 52900, true),
  ('tier_oversized_50', 'prod_oversized-tee', null, null, 50, 46900, true)
on conflict (id) do nothing;

-- Staff account. The password below is 'sweetginger' - CHANGE IT before real use, and
-- keep it out of the browser (this hash only ever lives in the database).
insert into public.admin_users (id, email, password_hash, role) values
  ('staff_admin', 'admin@sweetginger.local',
   'scrypt$33167be75e3e1c4db99451ea9052b79f$c1f9922a2ef79044e60c358e85dca86d243589b030cb7a51f49cbee012aeed986ccff8d885ff18b79ad39daa699403020cf7cc5fe3bff02da5c185a7bd3eebe3',
   'admin')
on conflict (id) do nothing;

-- ============================================================
-- NOTE ON GARMENT IMAGES
-- The seeded image_path values point at /garments/*.png, which is generated into the
-- app's public/ folder by scripts/build-garments.mjs (run automatically before dev and
-- build) and served from the host's CDN. That keeps product art working on a deploy with
-- no writable disk. It is PLACEHOLDER art: replace these files with real photography
-- (same filenames), or upload to the `studio` bucket and update image_path. Do not carry
-- placeholder art past step 2 of the implementation plan.
-- ============================================================
