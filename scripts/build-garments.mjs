// Generates the placeholder garment art into public/garments/.
//
// Runs automatically before `dev` and `build`, so the files always exist locally and on
// a host like Vercel. Garment art is product configuration, not user data, so it belongs
// in public/ (served from the CDN) rather than the writable-data folder.
//
// PLACEHOLDER ART: real photographed garments must replace these files. Keep the
// filenames (`{product-slug}--{colour-slug}.png`) so the seeded image paths stay valid.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import catalog from '../lib/catalog.json' with { type: 'json' };

const OUT_DIR = path.join(process.cwd(), 'public', 'garments');

function variantId(slug, colourName) {
  return `${slug}--${colourName.toLowerCase().replace(/\s+/g, '-')}`;
}

function garmentSvg(colour, product) {
  const { garmentWidth: W, garmentHeight: H } = catalog;
  const label = `${product.name} · ${colour.name} (placeholder garment art)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.24"/>
      <stop offset="45%" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.20"/>
    </linearGradient>
    <linearGradient id="fold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.00"/>
      <stop offset="50%" stop-color="#000000" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.00"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#eef0f2"/>
  <path d="M232 78 L306 58 Q320 96 334 58 L408 78 L548 168 L486 268 L438 234 L438 726 Q320 752 202 726 L202 234 L154 268 L92 168 Z"
        fill="${colour.hex}" stroke="#00000055" stroke-width="2"/>
  <path d="M232 78 L306 58 Q320 96 334 58 L408 78 L548 168 L486 268 L438 234 L438 726 Q320 752 202 726 L202 234 L154 268 L92 168 Z"
        fill="url(#shade)"/>
  <path d="M286 60 Q320 118 354 60 Q338 74 320 74 Q302 74 286 60 Z" fill="#00000033"/>
  <rect x="150" y="180" width="140" height="500" fill="url(#fold)"/>
  <rect x="350" y="180" width="140" height="500" fill="url(#fold)"/>
  <text x="320" y="784" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#5b6470" text-anchor="middle">${label}</text>
</svg>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let written = 0;
  for (const product of catalog.products) {
    for (const colour of catalog.colours) {
      const file = path.join(OUT_DIR, `${variantId(product.slug, colour.name)}.png`);
      await sharp(Buffer.from(garmentSvg(colour, product))).png().toFile(file);
      written += 1;
    }
  }
  console.log(`garment art: wrote ${written} file(s) to public/garments/`);
}

main().catch((error) => {
  console.error(`garment art generation failed: ${error.message}`);
  process.exit(1);
});
