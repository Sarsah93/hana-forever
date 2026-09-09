'use strict';
// Builds the app-icon source: the transparent four-leg standing Hana, cropped to her bounds with a
// margin and re-centred on a 1024x1024 canvas, with the soft matte tightened so small sizes stay crisp.
//   node tools/sprites/icon.cjs && npx tauri icon assets/icon/hana-icon.png -o src-tauri/icons
const fs = require('node:fs');
const path = require('node:path');
const { decode, encode, create, blit, resize } = require('./png.cjs');
const ROOT = path.resolve(__dirname, '..', '..');
const src = decode(fs.readFileSync(path.join(ROOT, 'assets/sprites/idle-stand/front-v1.png')));
// tighten alpha: the generated matte fades over ~25px; icons want a crisp edge
for (let i = 3; i < src.data.length; i += 4) src.data[i] = Math.max(0, Math.min(255, Math.round((src.data[i] - 70) * 255 / (215 - 70))));
let left = src.width, top = src.height, right = 0, bottom = 0;
for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (src.data[(y * src.width + x) * 4 + 3] > 24) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1); }
const w = right - left, h = bottom - top, size = Math.round(Math.max(w, h) * 1.12), out = create(size, size);
blit(out, src, Math.round((size - w) / 2), Math.round((size - h) / 2), { sx: left, sy: top, sw: w, sh: h });
const icon = size === 1024 ? out : resize(out, 1024, 1024);
fs.mkdirSync(path.join(ROOT, 'assets/icon'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'assets/icon/hana-icon.png'), encode(icon));
console.log(`icon source ${w}x${h} dog on ${size}px canvas -> assets/icon/hana-icon.png (1024x1024)`);
