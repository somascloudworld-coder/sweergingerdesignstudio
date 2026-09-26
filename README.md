# Sweet Ginger Design Studio

A browser studio where a customer designs a T-shirt on the real garment colour, for a
single order or a bulk run, and the print floor gets a print-ready file generated from
the same layers the customer saw.

Built against the three plan documents in `../SweetGingerDesignStudio/`:
`PRD.md` (what and for whom), `TECH-STACK.md` (what with), `IMPLEMENTATION-PLAN.md`
(in what order). The plan's 16 steps are implemented; see `WORKLOG.md` for the
verification of each one and `REPORT.md` for the status of every claim.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000, or set PORT
```

Nothing else is required for local development: the first request creates a SQLite
database at `.data/studio.db`, generates labelled placeholder garment art, and seeds
two T-shirt products (crew + oversized), five colours each, provisional print areas and
provisional bulk tiers.

Staff sign-in (admin queue, status workflow, print export):

```
email:    admin@sweetginger.local
password: sweetginger
```

Override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` before first run.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run verify:api` | End-to-end HTTP checks against a running dev server |
| `npm run verify:browser` | Real-Chrome checks of the canvas, cart and checkout |

`verify:api` and `verify:browser` expect the dev server on `http://localhost:3100`
(override with `VERIFY_BASE`).

## Data backends

One repository interface (`lib/db/repo.ts`), two implementations:

- **local** (default) — SQLite at `.data/studio.db`. This is the path the build was
  verified against on this machine.
- **supabase** — managed Postgres, the production path in `TECH-STACK.md`. Set
  `DATA_BACKEND=supabase` with `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and a server-side
  `SUPABASE_SERVICE_ROLE_KEY`, then run `supabase-setup.sql` in the Supabase SQL editor.

The browser only ever receives `NEXT_PUBLIC_*` values. The service-role key is read
server-side and is never sent to a client.

## How it is put together

```
app/                  Next.js pages and route handlers
  api/designs         create / read / save a design (save is server-validated)
  api/assets          artwork upload (decoded, validated, normalised with Sharp)
  api/orders          server-priced quote, and order creation with the artwork rule
  api/admin           staff-gated queue, status, print export, file download
components/           Studio, Fabric canvas, composited preview, admin controls
lib/geometry.ts       print-area maths: bounds, clamp, authoritative validation
lib/pricing.ts        the one place a unit price is decided
lib/render/scene.ts   the one renderer: both preview and print export call it
lib/render/raster.ts  Sharp rasterisation of that one renderer's SVG
lib/db/               repository interface + SQLite and Supabase implementations
```

Decisions taken where the PRD left a contradiction open (its own stated defaults):

| Ref | Decision | Where |
|---|---|---|
| C1 | Crew + oversized ship; polo is not seeded | `lib/catalog.ts` |
| C2 | Front only; the back tab appears only if a back print area exists | `components/Studio.tsx` |
| C3 | B2C is single-quantity/single-size; B2B is the size grid | `components/Studio.tsx` |
| C4 | Pricing schema supports colour and print method; tiers are provisional | `lib/pricing.ts`, `price_tiers` |
| C5 | One studio; both order types go through it | `app/api/orders` |
| C6 | Standalone studio, neutral branding, reskin left open | this app |
| C7 | "Artwork" read broadly: a text-only design is orderable | `app/api/orders/route.ts` |
| C8 | Print export generated automatically at export time from the saved layers | `app/api/admin/orders/[id]/export` |
| C9 | Switching product type warns, then starts a fresh design | `components/Studio.tsx` |
| C10 | Print areas are per product × side rows, provisional until D4 | `print_areas` |
| C11 | No customer accounts; saved designs stay out of scope | not built |

## Still provisional — do not treat as final

- Garment art is generated and labelled a placeholder (real photography not supplied).
- Print areas and DPI are placeholders (D4 unanswered).
- Bulk price tiers are placeholders (D3 unanswered).
- Payment is a flagged placeholder hand-off (D6 unresolved). No card data is collected.
- Embroidery is captured as placement/size/colour intent and flagged for manual
  digitizing. No stitch file is generated, on purpose.
