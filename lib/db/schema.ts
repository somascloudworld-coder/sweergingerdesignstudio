// Local development schema (SQLite). The production equivalent for Supabase
// Postgres lives in supabase-setup.sql; both model the same relations
// (TECH-STACK.md section 2). The design's source of truth is sides_json: structured
// layer data, never a flattened image.

export const SCHEMA_SQL = `
create table if not exists products (
  id text primary key,
  slug text not null unique,
  name text not null,
  garment_type text not null,
  base_price_paise integer not null,
  description text not null default '',
  image_path text not null default ''
);

create table if not exists product_variants (
  id text primary key,
  product_id text not null references products(id) on delete cascade,
  colour_name text not null,
  colour_hex text not null,
  image_path text not null default '',
  sort integer not null default 0
);

create table if not exists print_areas (
  id text primary key,
  product_id text not null references products(id) on delete cascade,
  side text not null check (side in ('front','back')),
  x real not null,
  y real not null,
  width real not null,
  height real not null,
  units text not null default 'px',
  provisional integer not null default 1,
  note text,
  unique (product_id, side)
);

create table if not exists designs (
  public_id text primary key,
  product_id text not null,
  variant_id text not null,
  sides_json text not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists design_elements (
  id text primary key,
  design_public_id text not null references designs(public_id) on delete cascade,
  layer_id text not null,
  element_type text not null,
  side text not null,
  z real not null,
  x real not null,
  y real not null,
  width real not null,
  height real not null,
  scale_x real not null,
  scale_y real not null,
  angle real not null,
  text_content text,
  asset_id text,
  font_family text,
  font_size real
);

create table if not exists price_tiers (
  id text primary key,
  product_id text not null,
  variant_id text,
  print_method text,
  min_qty integer not null,
  unit_price_paise integer not null,
  provisional integer not null default 1
);

create table if not exists orders (
  id text primary key,
  public_id text not null unique,
  order_type text not null check (order_type in ('B2C','B2B')),
  customer_name text not null,
  customer_phone text not null,
  customer_email text not null,
  customer_address text not null,
  company text,
  gstin text,
  status text not null,
  payment_status text not null,
  checkout_handoff text not null,
  subtotal_paise integer not null,
  total_paise integer not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists order_items (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  product_id text not null,
  variant_id text not null,
  colour_name text not null,
  print_method text not null,
  design_public_id text,
  design_snapshot_json text not null,
  unit_price_paise integer not null,
  quantity integer not null,
  line_total_paise integer not null
);

create table if not exists order_item_sizes (
  id text primary key,
  order_item_id text not null references order_items(id) on delete cascade,
  size text not null,
  qty integer not null
);

create table if not exists order_status_history (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  status text not null,
  note text,
  staff_email text,
  created_at text not null
);

create table if not exists print_outputs (
  id text primary key,
  order_item_id text not null references order_items(id) on delete cascade,
  side text not null,
  print_method text not null,
  format text not null default 'png',
  width_px integer not null,
  height_px integer not null,
  dpi integer not null,
  provisional integer not null default 1,
  manual_digitizing_required integer not null default 0,
  file_path text not null,
  created_at text not null
);

create table if not exists assets (
  id text primary key,
  design_public_id text,
  original_name text not null,
  mime text not null,
  file_path text not null,
  width integer not null,
  height integer not null,
  bytes integer not null,
  created_at text not null
);

create table if not exists admin_users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  role text not null default 'admin',
  created_at text not null
);
`;
