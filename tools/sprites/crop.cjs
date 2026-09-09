'use strict';
// Usage: node tools/sprites/crop.cjs <in.png> <x> <y> <w> <h> <zoom> <out.png> [checker]
// Crops a region, zooms it (nearest) over a checkerboard so alpha residue is visible.
const fs = require('node:fs'); const { decode, encode, create, fill, blit } = require('./png.cjs');
const [file, x, y, w, h, zoom, out] = process.argv.slice(2);
const img = decode(fs.readFileSync(file)); const z = Number(zoom);
const view = create(Number(w) * z, Number(h) * z);
for (let yy = 0; yy < view.height; yy += 8) for (let xx = 0; xx < view.width; xx += 8) { const c = ((xx >> 3) + (yy >> 3)) & 1 ? 240 : 190; fill(view, c, c, c, 255, { left: xx, top: yy, right: xx + 8, bottom: yy + 8 }); }
const crop = create(Number(w), Number(h));
for (let yy = 0; yy < crop.height; yy++) for (let xx = 0; xx < crop.width; xx++) { const s = ((Number(y) + yy) * img.width + Number(x) + xx) * 4, d = (yy * crop.width + xx) * 4; crop.data.set(img.data.subarray(s, s + 4), d); }
blit(view, crop, 0, 0, { scale: z });
fs.writeFileSync(out, encode(view));
