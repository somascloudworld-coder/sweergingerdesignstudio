# REPORT — Sweet Ginger Design Studio

Built to `../SweetGingerDesignStudio/PRD.md`, `TECH-STACK.md` and `IMPLEMENTATION-PLAN.md`,
in that order. The plan's 16 steps are implemented; the status of each is below, with the
command that proves it.

Stack as planned: Next.js + React + TypeScript, Fabric.js, Zustand, Zod, Sharp,
Vitest, a repository interface with a local SQLite backend (what this machine could run)
and the Supabase Postgres backend the Tech Stack specifies. Playwright-core drives the
installed Chrome for browser checks (no browser download).

## Status per part

### Phase 1 — canvas and preview (steps 1–6)

Step 1 — walking skeleton, real DB row, no secret in the browser: DONE
  evidence: `npm run verify:api` -> `PASS GET / returns 200`, `PASS the page renders the product name from a real database row -> db="Classic Crew T-Shirt" present=true`
  evidence: `npm run verify:api` -> `PASS no server-side secret appears in any browser-downloaded script -> 16 bundles scanned; clean`
  evidence: `npm run build` -> `✓ Compiled successfully in 12.3s`, `Finished TypeScript in 13.6s`

Step 1 — deploy to a real public URL: BLOCKED on Vercel credentials; deploy-readiness fixed
  evidence: `Get-Command vercel` (nothing), `Get-ChildItem Env: | Where-Object Name -match VERCEL` (nothing), three `auth.json` paths -> all absent
  evidence: this machine has `gh` authenticated as `somascloudworld-coder` (scopes `gist`, `read:org`, `repo`), which cannot create a Vercel deployment
  fixed in readiness for a deploy: print-file storage moved behind the repository (`writePrintOutputFile`), because the export route previously wrote to the local filesystem, which a serverless host cannot do
  evidence: `npm run verify:api` -> `PASS an embroidery export is flagged for manual digitizing and keeps its intent -> flag true, intents 1`; `PASS the print file downloads as a real PNG -> 15663 bytes`; `ALL CHECKS PASSED`
  gap: the app's default backend (SQLite on local disk) cannot persist on Vercel; a deploy must run `DATA_BACKEND=supabase`, which needs the Supabase project first

Step 2 — real product and print-area data: PARTIAL
  evidence: `npx vitest run tests/db.test.ts` -> `seeds two T-shirt products with five colours and a front print area each` passed; print areas flagged `provisional: true`
  evidence: `npm run verify:api` -> `PASS product_variants seeded -> 10 variants`; `PASS print_areas seeded per product x side -> 2 areas`
  gap: garment art is generated placeholder art, not real photography (not supplied)
  gap: print-area dimensions are placeholders until D4

Step 3 — canvas, and layer JSON as the source of truth: DONE
  evidence: `npm run verify:api` -> `PASS the reloaded design has two independently editable layers, not a flattened image -> layers=text,image`
  evidence: `npm run verify:api` -> `PASS the stored row is JSON text, not a binary blob -> {"front":[{"id":"l_text","x":150,...`
  evidence: `node scripts/e2e.mjs` -> `PASS the Fabric canvas mounts`, `PASS the text layer is saved -> Your text`, `PASS the uploaded image is stored as its own layer -> text,image`

Step 4 — the clamp, enforced twice: DONE
  evidence: `npm run verify:api` -> `PASS an out-of-bounds save is rejected even with the client bypassed -> status 422, code out_of_bounds`; `PASS the rejected save wrote nothing (design still has its two layers)`
  evidence: `node scripts/e2e.mjs` -> `PASS dragging far outside stops the element inside the boundary -> centre now (190.0, 361.9) in a 300x380 area`

Step 5 — the live preview: PARTIAL
  evidence: `node scripts/e2e.mjs` -> `PASS the design art uses a blend mode over the garment -> multiply,multiply`; `PASS the garment shading is laid back over the design inside the print zone -> multiply`
  gap: the plan's own verification is an unprompted second opinion saying it "looks printed, not pasted on". No person judged it in this session -> UNVERIFIED

Step 6 — persistence across colour, size and product type: DONE
  evidence: `npm run verify:api` -> `PASS switching colour leaves the layers byte-identical -> variant now classic-crew-tee--jet-black`
  evidence: `node scripts/e2e.mjs` -> `PASS switching product type asks before discarding the design -> Switching product type starts a new design...`; `PASS dismissing the warning keeps the current design -> 2 layers`; `PASS changing garment size leaves the design untouched -> layers identical`

### Phase 2 — order shape and pricing (steps 7–8)

Step 7 — server-authoritative tiered pricing: DONE (schema done; numbers provisional)
  evidence: `npm run verify:api` -> `PASS 1 unit uses the base tier -> 49900`, `PASS 10 units cross into the bulk tier -> 42900`, `PASS 50 units cross into the top tier -> 37900`
  evidence: `npm run verify:api` -> `PASS a client-forged price is ignored and recalculated -> unit 42900, total 429000`
  gap: the tier numbers are placeholders until D3; the schema already supports colour and print method

Step 8 — one order table, two order shapes: DONE
  evidence: `npm run verify:api` -> `PASS both order types live in the same table with the same shape -> B2C / B2B`; `PASS B2C row has one size -> one size row`; `PASS B2B row has a size grid -> three size rows`

### Phase 3 — cart, checkout, handoff (steps 9–11)

Step 9 — cart and the frozen design snapshot: DONE
  evidence: `node scripts/e2e.mjs` -> `PASS the line is added to the persisted cart -> 1 line`; `PASS further edits to the source design leave the cart line untouched -> cart layers 2, live layers 2`
  evidence: `npm run verify:api` -> `PASS editing the source design afterwards does not change the placed order (frozen snapshot)`

Step 10 — "no order without artwork," read broadly: DONE
  evidence: `npm run verify:api` -> `PASS an empty (never-designed) line is rejected -> code=NO_ARTWORK`; `PASS a text-only design (no upload) is accepted -> status 201, ref o_...`

Step 11 — checkout and the payment placeholder: DONE for order creation; payment BLOCKED on D6
  evidence: `node scripts/e2e.mjs` -> `PASS checkout completes and lands on the order -> o_21963a4372ad`; `PASS the order page shows the received status`; `PASS the order is stored with the placeholder payment hand-off -> placeholder_pending`
  evidence: `npm run verify:api` -> `PASS a B2B bulk order is created -> ref o_..., total 2116000`

### Phase 4 — admin and print output (steps 12–14)

Step 12 — print export from the same rendering code: DONE (spec provisional until D4)
  evidence: `npm run verify:api` -> `PASS export renders a print file for the ordered line -> outputs 1, dpi 300`; `PASS export resolution follows the print-area size at the chosen dpi -> exported 938px vs expected 938px`; `PASS the print file downloads as a real PNG -> ... bytes`
  evidence: `npx vitest run tests/export-parity.test.ts` -> 2 passed: export matches the preview once scaled to the same size, and text really rasterises
  note: the preview and the export call one function (`lib/render/scene.ts`). Sharp is used only to rasterise that function's SVG.

Step 13 — admin order queue: DONE
  evidence: `npm run verify:api` -> `PASS the admin queue matches the database exactly -> api 2 vs db 2` (and 4 vs 4, 5 vs 5 on later runs)
  evidence: `node scripts/e2e.mjs` -> `PASS the queue row count matches the database -> ui 5 vs db 5`; `PASS the new order appears in the queue`

Step 14 — status workflow, staff-gated: DONE
  evidence: `npm run verify:api` -> `PASS the admin API rejects an anonymous request -> status 401`; `PASS staff sign-in returns a session cookie -> 200`; `PASS a wrong password is rejected -> status 401`
  evidence: `npm run verify:api` -> `PASS advancing status persists the new state and one timestamped history row per change -> history: placed -> in_production`; `PASS the history records which staff member changed it -> admin@sweetginger.local`
  evidence: `node scripts/e2e.mjs` -> `PASS signed out, the queue redirects to sign-in -> http://localhost:3100/admin/login`

### Phase 5 — real device and acceptance (steps 15–16)

Step 15 — real phone, both hands: BLOCKED (no physical device; and the preview judgement needs a person)
Step 16 — owner acceptance: BLOCKED (needs Shankar or a delegate)

### Published source

Pushed to `https://github.com/somascloudworld-coder/sweergingerdesignstudio`: DONE
  evidence: `git push -u origin main` -> `* [new branch] main -> main`, `push exit=0`, commit `cb23699`
  evidence: `git ls-remote origin main` -> `cb236998b9d910a4d20fbc1b9e0fb04970e05b37` equals local `HEAD`
  evidence: `gh repo view ... --json isEmpty,defaultBranchRef` -> `"isEmpty":false`, `"defaultBranchRef":{"name":"main"}`
  evidence: `Invoke-WebRequest raw.githubusercontent.com/.../main/README.md` -> `STATUS: 200`
  scope: the app was pushed as its own repository (66 files). The surrounding starter folder — `order-desk/`, the digest agent, the shared `REPORT.md`/`WORKLOG.md` — was deliberately not pushed, since the repository is named for this app.
  check: `.env.local` and `.data/` are gitignored and were not committed; `raw.githubusercontent.com/.../main/.env.local` -> `absent (status 404)`
  note: the repository name is `sweergingerdesignstudio` (missing the "t" in "sweet"), which is the URL as given. It is public. Renaming is a one-click change in the repository settings; GitHub keeps a redirect from the old name.

### Deployed host (Vercel) — the ENOENT, and what it exposed

Reported by the owner after deploying: the page showed `Studio setup needed` with
`ENOENT: no such file or directory, mkdir '/var/task/.data'`. Diagnosis and fix: DONE
  diagnosis: the deployment was running the default local SQLite backend, which writes to
  a file on disk. A serverless host has no writable, persistent disk, so this was the wall
  predicted in the earlier report — not a new fault.
  defect 1 fixed: the local backend now refuses a serverless host with an actionable
  message instead of a raw driver error
  evidence: `$env:VERCEL="1"; $env:DATA_BACKEND="local"; npm run dev` then `Invoke-WebRequest /` -> `STATUS: 200`; page contains `not connected to a database`, `DATA_BACKEND=local`, `supabase-setup.sql`, `Redeploy`; page contains **no** `ENOENT` and **no** `mkdir`
  defect 2 fixed: garment art was served from the writable-data folder, so every product
  image would have 404-ed on the deploy even after switching to Supabase. It now lives in
  `public/garments/`, generated by `scripts/build-garments.mjs` (run by `predev`/`prebuild`)
  and served from the host's CDN.
  evidence: `node scripts/verify.mjs` -> `PASS garment art is served from public/ (not the writable-data folder) -> /garments/classic-crew-tee--optic-white.png -> 200 image/png`; `PASS no product image depends on the local data folder -> 10 of 10 point at /garments/`
  regression: `npm run build` compiled; `npx vitest run` -> `Tests 32 passed (32)`; `node scripts/verify.mjs` -> `ALL CHECKS PASSED`; `node scripts/e2e.mjs` -> `ALL BROWSER CHECKS PASSED`
  still required from the owner: the Supabase project and its four environment variables
  (below). This fix removes the crash and the broken image paths; it does not create a
  database, because it cannot.

### Production backend

Supabase Postgres adapter and `supabase-setup.sql`: UNVERIFIED
  reason: no Supabase project was provisioned for this build, and the schema cannot be
  created with a publishable key. The SQL is written and the adapter is complete, but
  nothing in it has been run. Local development and all checks above ran on SQLite.

## What broke and how I fixed it

1. **The drag test emptied the saved design.** `node scripts/diag.mjs` printed
   `[sg-debug] handleChange canvasObjects 2 refLayers 0 out 0` while the canvas still held
   the text. Cause: `ensureDesign()` linked the new design id using a stale `store.sides`
   snapshot — empty on that render — so the editor's layers were overwritten and the next
   canvas edit saved the emptiness. Fix: `setDesign` no longer overwrites layers when
   passed `null`, and every editor mutation reads `useStudio.getState()` rather than a
   render-closure snapshot. Re-ran `node scripts/e2e.mjs` -> all checks pass.

2. **Export resolution came out 1250px instead of 938px.** Cause: Sharp applied an extra
   96/72 density ratio on top of the SVG's own explicit pixel size. Fix: stopped passing
   an explicit density so 1 SVG unit renders as 1 output pixel. Re-ran
   `npm run verify:api` -> `exported 938px vs expected 938px`. The test was right; the
   code was wrong.

3. **Fabric's class names differ in v6.** `fabric.Object` no longer exists (`FabricObject`
   does), and `new fabric.Canvas(div)` needs a real `<canvas>` element. Found before
   running by reading `node_modules/fabric/dist/fabric.d.ts`, then fixed.

4. Two small test-side errors: an ambiguous `status` column in a verification join, and a
   stray tab between a function reference and its call. Both fixed in the checks, not by
   weakening them.

## Claims ledger

Every claim with the command that proves it. Anything not run here is marked UNVERIFIED.

- App builds and typechecks -> `npm run build` -> `✓ Compiled successfully`, `Finished TypeScript`; `npx tsc --noEmit` -> `TSC EXIT: 0`
- The page renders a real database row -> `npm run verify:api` -> `PASS ... db="Classic Crew T-Shirt" present=true`
- No secret reaches the browser -> `npm run verify:api` -> `PASS ... 16 bundles scanned; clean`
- Crew + oversized seeded, polo/hoodies/caps not -> `npx vitest run` -> `does not seed polo, hoodies or caps (PRD A1)` passed
- Print areas are per product × side data -> `npx vitest run tests/db.test.ts` -> two print-area rows, one per product
- Design is editable layer JSON, not a flattened image -> `npm run verify:api` -> `PASS the reloaded design has two independently editable layers`; `PASS the stored row is JSON text, not a binary blob`
- Out-of-bounds save rejected server-side, nothing written -> `npm run verify:api` -> `PASS ... status 422, code out_of_bounds`; `PASS the rejected save wrote nothing`
- Client clamp stops a hand-drag -> `node scripts/e2e.mjs` -> `PASS dragging far outside stops the element inside the boundary`
- Preview uses blend-mode compositing -> `node scripts/e2e.mjs` -> `PASS ... -> multiply,multiply`
- Preview "looks printed, not pasted on", by an unprompted person -> UNVERIFIED (no second person)
- Colour change never touches the design -> `npm run verify:api` -> `PASS switching colour leaves the layers byte-identical`
- Size change never touches the design -> `node scripts/e2e.mjs` -> `PASS changing garment size leaves the design untouched`
- Product-type switch warns before discarding -> `node scripts/e2e.mjs` -> `PASS switching product type asks before discarding the design -> Switching product type starts a new design...`
- Tier breakpoints applied exactly -> `npm run verify:api` -> `PASS 10 units cross into the bulk tier -> 42900`, `PASS 50 units cross into the top tier -> 37900`
- Client-forged price ignored -> `npm run verify:api` -> `PASS a client-forged price is ignored and recalculated -> unit 42900, total 429000`
- Both order types share one line shape -> `npm run verify:api` -> `PASS both order types live in the same table with the same shape -> B2C / B2B`
- An order always carries its own design -> `npm run verify:api` -> `PASS editing the source design afterwards does not change the placed order`
- Cart line frozen at add-to-cart time -> `node scripts/e2e.mjs` -> `PASS further edits to the source design leave the cart line untouched`
- A design-less order is blocked; a text-only design is allowed -> `npm run verify:api` -> `PASS an empty (never-designed) line is rejected -> code=NO_ARTWORK`; `PASS a text-only design (no upload) is accepted -> status 201`
- A full checkout completes in a real browser -> `node scripts/e2e.mjs` -> `PASS checkout completes and lands on the order -> o_21963a4372ad`
- Payment is a flagged placeholder, not a fake gateway -> `node scripts/e2e.mjs` -> `PASS ... -> placeholder_pending`; `npm run verify:api` -> `PASS payment is a flagged placeholder (D6 unresolved) -> placed/placeholder_pending`
- Export uses the same renderer as the preview -> `npx vitest run tests/export-parity.test.ts` -> 2 passed
- Export resolution follows dpi -> `npm run verify:api` -> `PASS export resolution follows the print-area size at the chosen dpi -> exported 938px vs expected 938px`
- Export renders text, not just images -> `npx vitest run tests/export-parity.test.ts` -> text rasterises to a non-trivial box
- Export downloadable only by staff -> `npm run verify:api` -> `PASS print files are not downloadable without staff sign-in -> status 401`
- Admin queue matches the database -> `npm run verify:api` -> `PASS the admin queue matches the database exactly -> api 2 vs db 2`; `node scripts/e2e.mjs` -> `PASS ... ui 5 vs db 5`
- Admin queue is inaccessible signed out -> `node scripts/e2e.mjs` -> `PASS signed out, the queue redirects to sign-in`
- Status advance is timestamped and attributable -> `npm run verify:api` -> `PASS ... history: placed -> in_production`; `PASS the history records which staff member changed it`
- Whole unit + integration suite green -> `npx vitest run` -> `Test Files 5 passed (5)`, `Tests 32 passed (32)`
- Whole browser suite green -> `node scripts/e2e.mjs` -> `ALL BROWSER CHECKS PASSED`, `PASS no client-side errors during the flow -> none`
- Print files are written through the repository, not straight to disk -> `npm run verify:api` -> `PASS the print file downloads as a real PNG -> 15663 bytes` (local backend: `.data/print/...`). This is what makes the export path workable on a serverless host, where the filesystem is not writable.
- Embroidery is never auto-digitized -> `npm run verify:api` -> `PASS an embroidery export is flagged for manual digitizing and keeps its intent -> flag true, intents 1`; `PASS the intent carries placement, size and colour but claims no stitch file`
- Source is published on GitHub -> `git ls-remote origin main` -> `cb236998b9d910a4d20fbc1b9e0fb04970e05b37` == local `HEAD`; live README `STATUS: 200`; live `.env.local` -> `absent (status 404)`
- A serverless host is refused by the local backend with an actionable message, not a raw ENOENT -> `$env:VERCEL="1"; npm run dev` then `Invoke-WebRequest /` -> `STATUS: 200`, `FOUND: not connected to a database`, no `ENOENT`, no `mkdir`
- Product art does not depend on the writable-data folder -> `node scripts/verify.mjs` -> `PASS no product image depends on the local data folder -> 10 of 10 point at /garments/`
- Garment art regenerates on every dev and build -> `node scripts/build-garments.mjs` -> `garment art: wrote 10 file(s) to public/garments/` (wired to `predev` and `prebuild`)
- Supabase backend works -> UNVERIFIED (no project provisioned; SQL not yet run)
- Deployed to a public URL -> UNVERIFIED (not attempted; no host credentials)
- Real garment photography in the picker -> UNVERIFIED (placeholder art)
- Real print-floor dimensions / DPI -> UNVERIFIED (placeholders, flagged in the UI)
- Real bulk price tiers -> UNVERIFIED (placeholders, flagged in the UI)
- Usable one-handed on a real phone -> UNVERIFIED (no device)
- Owner completes both flows unaided -> UNVERIFIED (needs the owner)

## Walls

```
BLOCKED: deploy the studio to a real public URL (plan step 1)
  Tried:      Get-Command vercel; Get-Command vercel.cmd; Get-ChildItem Env: | Where-Object Name -match VERCEL;
              Test-Path %APPDATA%\com.vercel.cli\auth.json, ~\.vercel\auth.json, %LOCALAPPDATA%\com.vercel.cli\auth.json
  Got:        no vercel command; no VERCEL_* environment variable; all three auth files absent.
              gh is authenticated as somascloudworld-coder (scopes gist, read:org, repo), which
              cannot create a Vercel deployment.
  Wall:       creating a deployment needs the owner's Vercel account. It is a login this
              machine does not have, not a code problem.
  To unblock: either (a) the owner signs in once with `npx vercel login` (or `npx vercel link`
              in sweet-ginger-studio/, then `npx vercel --prod`), or (b) a VERCEL_TOKEN is
              provided and `npx vercel deploy --prod --token $VERCEL_TOKEN` is run from
              sweet-ginger-studio/. Either way the project must be created with Root Directory
              = sweet-ginger-studio if it is linked to the repo root, because the app is not at
              the repository root.

BLOCKED: a deploy that actually works (needs the Supabase project first)
  Tried:      running locally with DATA_BACKEND=local; reading lib/paths.ts and the export route
  Got:        the default backend is SQLite at .data/studio.db. Vercel's filesystem is
              ephemeral and read-only outside /tmp, so orders, uploaded artwork and designs
              would vanish between invocations and the first write would fail.
  Wall:       the working backend needs the Supabase project, which needs the owner.
  To unblock: create the Supabase project, run sweet-ginger-studio/supabase-setup.sql, then set
              DATA_BACKEND=supabase, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
              and SUPABASE_SERVICE_ROLE_KEY in Vercel (Production), and redeploy — variables are
              read at build time, so saving them is not enough.
  CORRECTED 26 Sep: an earlier version of this note warned that garment images would 404 on the
              deployed site because they were served from the writable-data folder. That is
              fixed: product art now comes from public/garments/ and needs nothing from Supabase.

BLOCKED: the Supabase production backend (TECH-STACK section 2)
  Tried:      `Get-Command supabase`; no CLI, no project credentials in the environment
  Got:        only the publishable key from the earlier order-desk project, which cannot run DDL
  Wall:       creating tables and a storage bucket needs the project owner or an access token
  To unblock: the owner creates (or opens) the Supabase project and runs
              sweet-ginger-studio/supabase-setup.sql in the SQL editor, then sets
              DATA_BACKEND=supabase with the three Supabase variables server-side.

BLOCKED: the preview second opinion, steps 15 and 16 (the real device and the owner)
  Tried:      programmatic checks of compositing, layout parity and colour-swap stability
  Got:        `node scripts/e2e.mjs` passes, but a machine cannot give the plan's required
              unprompted human answer of whether it "looks printed" or "looks pasted on"
  Wall:       needs a person looking at a real screen, and a real phone for one-handed use
  To unblock: Shankar (or a delegate) opens the studio, designs a shirt, and completes one
              B2C order and one B2B quote unaided; if a printed sample exists, compare it
              to the preview directly.
```

## What I would tell the next person

- Read `../SweetGingerDesignStudio/IMPLEMENTATION-PLAN.md` before changing anything. The
  order matters: the layer-JSON model and the per-product × side print areas were built
  first on purpose, and the red line (steps 3, 4, 10, 12) must not be cut.
- The five client decisions that gate the plan defaulted as the PRD itself recommends:
  C1 crew+oversized only, C2 front only, C3 single-quantity B2C, C7 broad ("text counts as
  artwork"), C5 one studio. Each is cheap to change later because the schema is per-side,
  per-product and per-tier.
- Replace three things before this is real, and do not quietly keep the placeholders:
  garment photography, print-area dimensions/DPI from Ginger Prints (D4), and the bulk
  price sheet (D3). All three are flagged provisional in the UI and in the data.
- The print export is one function (`lib/render/scene.ts`) shared with the preview. If
  someone ever writes a second renderer for exports, the "close to printed" guarantee
  stops being true — that is the plan's own warning, not mine.
- Embroidery deliberately produces a placement/size/colour intent JSON, not a stitch file.
  Do not "fix" that by inventing a digitizer.
- The staff password is `sweetginger` and the seeded admin email is
  `admin@sweetginger.local`. Change both before any real use; the hash is the only thing
  stored, and it never reaches the browser.
- Local verification is reproducible: `npm run dev` on port 3100, then `npm test`,
  `npm run verify:api`, `npm run verify:browser`. `verify:browser` drives the installed
  Chrome through playwright-core, so no browser download is needed.
