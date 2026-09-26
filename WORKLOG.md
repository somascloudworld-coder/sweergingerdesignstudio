# WORKLOG — Sweet Ginger Design Studio

One line per slice: `<what I did> -> <command> -> <what it printed>`.
Companion: `REPORT.md` (claim-by-claim status). Plans live in `../SweetGingerDesignStudio/`.

## Step 0 — read the plans, check the ground

- Read `PRD.md`, `TECH-STACK.md`, `IMPLEMENTATION-PLAN.md` in that order -> read tool -> the brief's 11 contradictions (C1-C11), its own defaults (A1-A12), the 16-step order, the red line, and the gating decisions
- Probed the machine for the stack the plans assume -> `Get-Command psql/docker/supabase` + env + `git remote` -> no Postgres, no Docker, no Supabase CLI: hosted Supabase only from the earlier `order-desk` work
- Checked the runtime -> `node -v` / `npm -v` -> `v22.12.0` / `10.9.0`; `node:sqlite` needs a flag, so chose `better-sqlite3` for the local backend

## Step 1-2 — app, framework, host and real product data

- Scaffolded `sweet-ginger-studio/` (Next.js 16 + React 19 + TypeScript, Fabric.js, Zustand, Zod, Sharp, better-sqlite3, Vitest) -> `npm install` -> `added 190 packages in 2m`
- Verified the native deps the rendering path depends on -> `node -e "require('better-sqlite3')...; require('sharp')"` -> `better-sqlite3 OK { c: 1 }`, `sharp OK`
- Wrote the schema (`lib/db/schema.ts`) and the local repo (`lib/db/sqlite.ts`) + seeder (`lib/db/seed.ts`) -> `npx vitest run tests/db.test.ts` -> 10 passed: 2 products, 5 variants each, 1 front print area each (flagged provisional), tiers `[1,10,50]`
- Confirmed the product set follows PRD A1 -> same test -> `does not seed polo, hoodies or caps (PRD A1)` passed
- Started the app -> `background_process` -> `✓ Ready in 1261ms`
- Proved the page renders a real DB row, not a hard-coded value, and no secret reaches the browser -> `node scripts/verify.mjs` -> `PASS the page renders the product name from a real database row -> db="Classic Crew T-Shirt" present=true`; `PASS no server-side secret appears in any browser-downloaded script -> 16 bundles scanned; clean`
- Confirmed garment art is served from disk -> same run -> `PASS garment image served from disk -> 200 image/png`

## Step 3 — the canvas and layer JSON

- Built the Fabric editor (`components/DesignCanvas.tsx`) and the store (`lib/store.ts`) -> `node scripts/e2e.mjs` -> `PASS the Fabric canvas mounts`, `PASS a design row is created on first edit -> d_da087243faca`, `PASS the text layer is saved -> Your text`
- Proved the design is editable layers, not a flattened picture -> `npm run verify:api` -> `PASS the reloaded design has two independently editable layers, not a flattened image -> layers=text,image`; `PASS the stored row is JSON text, not a binary blob -> {"front":[{"id":"l_text",...`
- Proved artwork upload becomes its own image layer -> `node scripts/e2e.mjs` -> `PASS the uploaded image is stored as its own layer -> text,image`

## Step 4 — the clamp, enforced twice

- Built the client clamp (geometry maths) and the authoritative server check -> `npm run verify:api` -> `PASS an out-of-bounds save is rejected even with the client bypassed -> status 422, code out_of_bounds`; `PASS the rejected save wrote nothing (design still has its two layers)`
- Proved the client clamp stops a hand-drag past the boundary -> `node scripts/e2e.mjs` -> `PASS dragging far outside stops the element inside the boundary -> centre now (190.0, 361.9) in a 300x380 area`

## Step 5 — the live preview

- Composited the design onto the garment colour with blend modes plus the garment's own shading over the ink -> `node scripts/e2e.mjs` -> `PASS the design art uses a blend mode over the garment -> multiply,multiply`; `PASS the garment shading is laid back over the design inside the print zone -> multiply`
- The plan's second opinion ("looks printed, not pasted on") needs a person, not a test -> not produced here -> `UNVERIFIED` in `REPORT.md`

## Step 6 — persistence across colour, size and product type

- Proved a colour change leaves the design byte-identical -> `npm run verify:api` -> `PASS switching colour leaves the layers byte-identical -> variant now classic-crew-tee--jet-black`
- Proved the same through the UI -> `node scripts/e2e.mjs` -> `PASS the layers are byte-identical after a colour change -> variant classic-crew-tee--jet-black`
- Proved a product-type switch warns first -> `node scripts/e2e.mjs` -> `PASS switching product type asks before discarding the design -> Switching product type starts a new design. The current design will be discarded. Continue?`; `PASS dismissing the warning keeps the current design -> 2 layers`
- Proved a size change never touches the design -> `node scripts/e2e.mjs` -> `PASS changing garment size leaves the design untouched -> layers identical`

## Step 7 — pricing that cannot be trusted from the browser

- Built server-side tiered pricing (`lib/pricing.ts`, `/api/orders/quote`) -> `npm run verify:api` -> `PASS 1 unit uses the base tier -> 49900`; `PASS 10 units cross into the bulk tier -> 42900`; `PASS 50 units cross into the top tier -> 37900`
- Proved a forged client price is ignored -> same run -> `PASS a client-forged price is ignored and recalculated -> unit 42900, total 429000`

## Step 8 + 9 — two order shapes, frozen snapshots

- Two order shapes, one line table -> `npm run verify:api` -> `PASS both order types live in the same table with the same shape -> B2C / B2B`; `PASS B2C row has one size`; `PASS B2B row has a size grid -> three size rows`
- Froze the design into the order -> same run -> `PASS the order carries its own frozen design -> snapshot text recovered from the order`; `PASS editing the source design afterwards does not change the placed order (frozen snapshot) -> 1 layer(s) frozen in the order`
- Proved the cart line is frozen against further edits -> `node scripts/e2e.mjs` -> `PASS further edits to the source design leave the cart line untouched -> cart layers 2, live layers 2`

## Step 10 — no order without artwork, read broadly

- Enforced the rule server-side, broadly (text-only allowed) -> `npm run verify:api` -> `PASS an empty (never-designed) line is rejected -> code=NO_ARTWORK`; `PASS a text-only design (no upload) is accepted -> status 201`

## Step 11 — checkout and the payment placeholder

- Completed a real B2C order through the browser -> `node scripts/e2e.mjs` -> `PASS checkout completes and lands on the order -> o_21963a4372ad`; `PASS the order page shows the received status`
- Confirmed the flagged placeholder, not a fake payment -> same run -> `PASS the order is stored with the placeholder payment hand-off -> placeholder_pending`

## Step 12 — print export from the same renderer

- Built one renderer used by both preview and export (`lib/render/scene.ts`) and Sharp rasterisation (`lib/render/raster.ts`) -> `npm run verify:api` -> `PASS export renders a print file for the ordered line -> outputs 1, dpi 300`; `PASS export resolution follows the print-area size at the chosen dpi -> exported 938px vs expected 938px`
- Proved preview and export agree, by measurement -> `npx vitest run tests/export-parity.test.ts` -> 2 passed: same layout at both sizes, and text really rasterises (`info.width > 40`)
- First run of that check failed -> `FAIL export resolution ... exported 1250px vs expected 938px` -> cause: Sharp applied a 96/72 SVG density ratio on top of the SVG's own explicit size -> fix: dropped the explicit density so 1 SVG unit = 1 output pixel -> re-ran -> `exported 938px vs expected 938px`

## Step 13 + 14 — admin queue and status workflow

- Built the staff-gated queue, order detail, status advance and export -> `npm run verify:api` -> `PASS the admin API rejects an anonymous request -> status 401`; `PASS staff sign-in returns a session cookie -> 200`; `PASS a wrong password is rejected -> status 401`
- Proved the queue matches the database exactly -> same run -> `PASS the admin queue matches the database exactly -> api 2 vs db 2` (and 4 vs 4, and 5 vs 5, on later runs)
- Proved a status advance is timestamped and attributable -> same run -> `PASS advancing status persists the new state and one timestamped history row per change -> history: placed -> in_production`; `PASS the history records which staff member changed it -> admin@sweetginger.local`
- Proved the real UI gate -> `node scripts/e2e.mjs` -> `PASS signed out, the queue redirects to sign-in -> http://localhost:3100/admin/login`; `PASS the queue row count matches the database -> ui 5 vs db 5`

## Bug found and fixed during verification

- The drag test emptied the saved design -> `node scripts/diag.mjs` -> `[sg-debug] handleChange ... refLayers 0 out 0` while the canvas still held the text -> cause: `ensureDesign()` linked the new design id with a stale `store.sides` snapshot (empty at that render), overwriting the editor's layers; the next canvas edit then saved the emptiness -> fix: `setDesign` no longer overwrites layers when given `null`, and every editor mutation now reads `useStudio.getState()` instead of a render-closure snapshot -> re-ran -> `PASS dragging far outside stops the element inside the boundary`

## Post-build — deploy readiness (26 Sep)

- Read the export path for a serverless host -> found a real blocker: the export route wrote the PNG and the embroidery JSON straight to the local filesystem, which is read-only on a serverless host and wrong for the Supabase backend
- Moved print-file storage behind the repository -> `writePrintOutputFile` added to `lib/db/repo.ts` (local -> disk with a traversal guard, Supabase -> `studio` bucket); removed the duplicate embroidery JSON file, since the intent is derivable from stored data and is now returned by the export response -> `npx tsc --noEmit` -> `TSC EXIT: 0`
- Re-verified the export path -> `npm run verify:api` -> `PASS an embroidery export is flagged for manual digitizing and keeps its intent -> flag true, intents 1`; `PASS the intent carries placement, size and colour but claims no stitch file -> note "For manual digitizing. Not a stitch file."`; `PASS the print file downloads as a real PNG -> 15663 bytes`; `ALL CHECKS PASSED`
- Re-ran the unit suite after the interface change -> `npx vitest run` -> `Tests 32 passed (32)`
- Attempted the Vercel deploy -> `Get-Command vercel` + `Env:VERCEL*` + three auth.json paths -> no CLI, no token, no session: `BLOCKED`, see `REPORT.md`

## Post-build — pushed to GitHub (26 Sep)

- Checked the target before touching it -> `gh repo view somascloudworld-coder/sweergingerdesignstudio --json ...` -> `{"isEmpty":true,"visibility":"PUBLIC","defaultBranchRef":{"name":""}}`; the correctly-spelled `sweetgingerdesignstudio` does not exist
- Checked push auth without mutating anything -> `git ls-remote https://github.com/.../sweergingerdesignstudio` -> `exit=0`, no refs (empty repo)
- Made the app its own repo rather than pushing the whole starter folder (which holds `order-desk/`, the digest agent and unrelated docs) -> `git init -b main` -> `Initialized empty Git repository`
- Scanned the staged tree before committing -> `git diff --cached --name-only | Select-String '\.env\.local|^\.data/|node_modules|\.next/'` -> no matches; 66 files staged
- Scanned staged content for secret-shaped strings -> `Select-String 'sb_secret_|sb_publishable_...|sk-...|PRIVATE KEY|gho_...'` -> two hits, both benign (the `.env.example` placeholder comment, and my own leak-scan patterns in `scripts/verify.mjs`)
- Committed and pushed -> `git commit` + `git push -u origin main` -> `cb23699`, `* [new branch] main -> main`, `push exit=0`
- Verified the push from the remote side, not just the CLI -> `git ls-remote origin main` -> `cb236998b9d910a4d20fbc1b9e0fb04970e05b37` equals local HEAD; `gh repo view` -> `"isEmpty":false`, `"defaultBranchRef":{"name":"main"}`
- Verified the live content and that the env file did not go up -> `Invoke-WebRequest raw.githubusercontent.com/.../main/README.md` -> `STATUS: 200`; `.../main/.env.local` -> `absent (status 404)`

## Gates and walls

- Real garment photography (plan step 2) -> not supplied -> generated labelled placeholder art, `UNVERIFIED` as real photography
- D4 print-floor dimensions and DPI, D3 price sheet -> not supplied -> provisional values, clearly flagged in the UI and in `WORKLOG`/`REPORT`
- Vercel deploy (plan step 1's "a real URL") -> no Vercel credentials -> not attempted; see `REPORT.md` BLOCKED
- Supabase project -> none provisioned -> adapter written and `supabase-setup.sql` produced; the Supabase path is `UNVERIFIED`
- Second-opinion preview judgement, real phone (step 15), owner acceptance (step 16) -> need a person and a device -> `BLOCKED`, see `REPORT.md`
