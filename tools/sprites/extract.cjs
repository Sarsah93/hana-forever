'use strict';
// Builds the motion-v3 atlas from the generated 4x2 pose sheets.
//   node tools/sprites/extract.cjs            -> assets/sprites/motion-v3/hana-atlas-v3.png + src/assets/motion-v3.ts
//   node tools/sprites/extract.cjs --debug    -> also writes per-sheet cutout previews to tools/sprites/out/
// The sheets are RGB renders on a flat neutral grey (or a painted checkerboard) with no alpha.
// Background is keyed by *neutrality* (low saturation) and connectivity to the sheet border, so the
// dog's black nose/eyes and white teeth survive. Frames are found as connected components, ordered
// row-major, and their feet anchors are measured from the solid pixels of the lowest rows.
const fs = require('node:fs');
const path = require('node:path');
const { decode, encode, create, blit, fill, resize } = require('./png.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_DIR = path.join(ROOT, 'assets', 'sprites', '_source', 'v3');
const OUT_DIR = path.join(ROOT, 'assets', 'sprites', 'motion-v3');
const DEBUG = process.argv.includes('--debug');
const DEBUG_DIR = path.join(__dirname, 'out');

/** Sheet order matches the delivery note: 정면-털기, 정면 엎드리기, 뒤로 돈 상태에서 정면 바라보기, 뒷다리로 턱 긁기, 하품, 웅크리고 앉은 후 되새김질. */
const SHEETS = [
  { id: 'front-shake', file: 'front-shake.png', frames: 8 },
  { id: 'lie-front', file: 'lie-front.png', frames: 8 },
  { id: 'recline-back', file: 'recline-back.png', frames: 8 },
  { id: 'scratch', file: 'scratch.png', frames: 8 },
  { id: 'yawn', file: 'yawn.png', frames: 8 },
  { id: 'crouch-lick', file: 'crouch-rumination.png', frames: 8 }
];
const SAT_T = 20;      // max-min channel spread that still counts as neutral background
const LUM_MIN = 58;    // darker neutrals are eyes/nose, never background
const BAND = 3;        // feathered edge width in source pixels
const PAD = 2;         // atlas padding
const DOWNSCALE = 0.75; // atlas frames are stored at 3/4 of the 1536x1024 sheet resolution (still >= 2x the on-screen size at 200% DPI)

const lum = (d, o) => (d[o] * 299 + d[o + 1] * 587 + d[o + 2] * 114) / 1000;
const sat = (d, o) => Math.max(d[o], d[o + 1], d[o + 2]) - Math.min(d[o], d[o + 1], d[o + 2]);

function keyBackground(img) {
  const { width, height, data } = img, n = width * height;
  const candidate = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const o = i * 4; if (sat(data, o) <= SAT_T && lum(data, o) >= LUM_MIN) candidate[i] = 1; }
  // 1) background = neutral pixels connected to the border
  const bg = new Uint8Array(n), queue = new Int32Array(n); let head = 0, tail = 0;
  const push = (i) => { if (candidate[i] && !bg[i]) { bg[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % width;
    if (x > 0) push(i - 1); if (x < width - 1) push(i + 1); if (i >= width) push(i - width); if (i + width < n) push(i + width);
  }
  // 2) enclosed neutral islands that match the sheet's own background tone are holes (between paws, under the chin)
  const border = []; for (let x = 0; x < width; x += 7) { border.push(lum(data, x * 4)); border.push(lum(data, ((height - 1) * width + x) * 4)); }
  border.sort((a, b) => a - b); const tones = [...new Set(border.map(v => Math.round(v / 8) * 8))];
  const seen = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (!candidate[s] || bg[s] || seen[s]) continue;
    let qh = 0, qt = 0, sum = 0; queue[qt++] = s; seen[s] = 1;
    while (qh < qt) {
      const i = queue[qh++], x = i % width; sum += lum(data, i * 4);
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i >= width ? i - width : -1, i + width < n ? i + width : -1]) {
        if (j >= 0 && candidate[j] && !bg[j] && !seen[j]) { seen[j] = 1; queue[qt++] = j; }
      }
    }
    const mean = sum / qt;
    if (qt >= 30 && tones.some(t => Math.abs(t - mean) <= 14)) for (let k = 0; k < qt; k++) bg[queue[k]] = 1;
  }
  // 3) feather: foreground pixels within BAND of the background get alpha from how un-neutral they are,
  //    and their colour is decontaminated against the nearest background pixel.
  const dist = new Uint8Array(n).fill(255), from = new Int32Array(n).fill(-1);
  head = 0; tail = 0;
  for (let i = 0; i < n; i++) if (bg[i]) { dist[i] = 0; from[i] = i; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++], x = i % width; if (dist[i] >= BAND) continue;
    for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i >= width ? i - width : -1, i + width < n ? i + width : -1]) {
      if (j >= 0 && dist[j] === 255) { dist[j] = dist[i] + 1; from[j] = from[i]; queue[tail++] = j; }
    }
  }
  const out = create(width, height); out.data.set(data);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (bg[i]) { out.data[o + 3] = 0; continue; }
    if (dist[i] === 255) { out.data[o + 3] = 255; continue; }
    const b = from[i] * 4, bgLum = lum(data, b);
    const satTerm = (sat(data, o) - 6) / 26, lumTerm = (Math.abs(lum(data, o) - bgLum) - 22) / 70;
    const edge = dist[i] / (BAND + 1);
    const a = Math.min(1, Math.max(0, Math.max(satTerm, lumTerm, edge)));
    if (a <= 0.02) { out.data[o + 3] = 0; continue; }
    for (let c = 0; c < 3; c++) out.data[o + c] = Math.max(0, Math.min(255, Math.round((data[o + c] - (1 - a) * data[b + c]) / a)));
    out.data[o + 3] = Math.round(a * 255);
  }
  return out;
}

/** Connected components of alpha>0 after a box dilation, so loose fur tufts join their body. Row-major order. */
function findFrames(img, expected) {
  const { width, height, data } = img, n = width * height, R = 3;
  const solid = new Uint8Array(n); for (let i = 0; i < n; i++) solid[i] = data[i * 4 + 3] > 40 ? 1 : 0;
  const rowMax = new Uint8Array(n), dil = new Uint8Array(n);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { let v = 0; for (let k = -R; k <= R && !v; k++) { const xx = x + k; if (xx >= 0 && xx < width && solid[y * width + xx]) v = 1; } rowMax[y * width + x] = v; }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { let v = 0; for (let k = -R; k <= R && !v; k++) { const yy = y + k; if (yy >= 0 && yy < height && rowMax[yy * width + x]) v = 1; } dil[y * width + x] = v; }
  const label = new Int32Array(n).fill(-1), queue = new Int32Array(n), comps = [];
  for (let s = 0; s < n; s++) {
    if (!dil[s] || label[s] >= 0) continue;
    const id = comps.length, c = { id, left: width, top: height, right: 0, bottom: 0, area: 0, sx: 0, sy: 0 };
    let h = 0, t = 0; queue[t++] = s; label[s] = id;
    while (h < t) {
      const i = queue[h++], x = i % width, y = (i / width) | 0;
      if (solid[i]) { c.area++; c.sx += x; c.sy += y; c.left = Math.min(c.left, x); c.right = Math.max(c.right, x + 1); c.top = Math.min(c.top, y); c.bottom = Math.max(c.bottom, y + 1); }
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i >= width ? i - width : -1, i + width < n ? i + width : -1]) if (j >= 0 && dil[j] && label[j] < 0) { label[j] = id; queue[t++] = j; }
    }
    if (c.area) comps.push(c);
  }
  const largest = Math.max(...comps.map(c => c.area));
  const big = comps.filter(c => c.area >= largest * 0.25), small = comps.filter(c => c.area < largest * 0.25 && c.area >= 12);
  const gap = (a, b) => Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)) + Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
  for (const s of small) {
    const host = big.reduce((best, c) => gap(c, s) < gap(best, s) ? c : best);
    if (gap(host, s) > 60) continue; // stray speck far from any body
    host.left = Math.min(host.left, s.left); host.right = Math.max(host.right, s.right); host.top = Math.min(host.top, s.top); host.bottom = Math.max(host.bottom, s.bottom);
    host.area += s.area; host.sx += s.sx; host.sy += s.sy;
  }
  const frames = big.map(c => ({ ...c, cx: c.sx / c.area, cy: c.sy / c.area }));
  frames.sort((a, b) => a.cy - b.cy);
  const rows = []; for (const f of frames) { const row = rows.find(r => Math.abs(r.cy - f.cy) < 170); if (row) { row.items.push(f); row.cy = (row.cy * (row.items.length - 1) + f.cy) / row.items.length; } else rows.push({ cy: f.cy, items: [f] }); }
  rows.sort((a, b) => a.cy - b.cy); const ordered = rows.flatMap(r => r.items.sort((a, b) => a.cx - b.cx));
  if (ordered.length !== expected) console.warn(`  ! expected ${expected} frames, found ${ordered.length}: ${ordered.map(f => `${f.left},${f.top}-${f.right},${f.bottom} a=${f.area}`).join(' ; ')}`);
  return ordered;
}

/** Feet anchor: horizontal centre of the solid pixels in the lowest rows of the frame, on its lowest solid row. */
function footAnchor(img, f) {
  const { width, data } = img; const solidAt = (x, y) => data[(y * width + x) * 4 + 3] >= 128;
  let bottom = f.bottom; for (let y = f.bottom - 1; y >= f.top; y--) { let any = false; for (let x = f.left; x < f.right && !any; x++) any = solidAt(x, y); if (any) { bottom = y + 1; break; } }
  const band = Math.max(10, Math.round((bottom - f.top) * 0.08)); let l = f.right, r = f.left;
  for (let y = bottom - band; y < bottom; y++) for (let x = f.left; x < f.right; x++) if (solidAt(x, y)) { l = Math.min(l, x); r = Math.max(r, x + 1); }
  return { x: Math.round((l + r) / 2), y: bottom };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true }); if (DEBUG) fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const clips = [], placed = [];
  const ATLAS_W = 1536; let cursorX = PAD, cursorY = PAD, shelfH = 0;
  for (const sheet of SHEETS) {
    const src = decode(fs.readFileSync(path.join(SOURCE_DIR, sheet.file)));
    console.log(`${sheet.id}: ${src.width}x${src.height}`);
    const keyed = keyBackground(src);
    const frames = findFrames(keyed, sheet.frames);
    if (DEBUG) {
      const view = create(keyed.width, keyed.height);
      for (let y = 0; y < view.height; y += 16) for (let x = 0; x < view.width; x += 16) { const c = ((x >> 4) + (y >> 4)) & 1 ? 235 : 200; fill(view, c, c, c, 255, { left: x, top: y, right: x + 16, bottom: y + 16 }); }
      blit(view, keyed, 0, 0);
      for (const f of frames) { const a = footAnchor(keyed, f); fill(view, 255, 0, 0, 255, { left: f.left, top: f.top, right: f.right, bottom: f.top + 2 }); fill(view, 255, 0, 0, 255, { left: f.left, top: f.bottom - 2, right: f.right, bottom: f.bottom }); fill(view, 0, 120, 255, 255, { left: a.x - 4, top: a.y - 8, right: a.x + 4, bottom: a.y + 2 }); }
      fs.writeFileSync(path.join(DEBUG_DIR, `${sheet.id}-keyed.png`), encode(view));
    }
    const clip = { id: sheet.id, frames: [] };
    for (const f of frames) {
      const anchor = footAnchor(keyed, f);
      const fw = f.right - f.left, fh = f.bottom - f.top;
      const crop = create(fw, fh);
      for (let y = 0; y < fh; y++) crop.data.set(keyed.data.subarray(((f.top + y) * keyed.width + f.left) * 4, ((f.top + y) * keyed.width + f.right) * 4), y * fw * 4);
      const w = Math.round(fw * DOWNSCALE), h = Math.round(fh * DOWNSCALE), small = resize(crop, w, h);
      if (cursorX + w + PAD > ATLAS_W) { cursorX = PAD; cursorY += shelfH + PAD; shelfH = 0; }
      placed.push({ img: small, sx: 0, sy: 0, w, h, x: cursorX, y: cursorY });
      clip.frames.push({ rect: [cursorX, cursorY, w, h], foot: [cursorX + Math.round((anchor.x - f.left) * DOWNSCALE), cursorY + Math.round((anchor.y - f.top) * DOWNSCALE)] });
      cursorX += w + PAD; shelfH = Math.max(shelfH, h);
    }
    // each sheet starts a fresh shelf so clips stay visually grouped in the atlas
    cursorX = PAD; cursorY += shelfH + PAD; shelfH = 0;
    clips.push(clip);
    console.log(`  frames: ${clip.frames.map(fr => `${fr.rect[2]}x${fr.rect[3]}`).join(' ')}`);
  }
  const atlas = create(ATLAS_W, cursorY);
  for (const p of placed) blit(atlas, p.img, p.x, p.y, { sx: p.sx, sy: p.sy, sw: p.w, sh: p.h });
  const atlasPath = path.join(OUT_DIR, 'hana-atlas-v3.png');
  fs.writeFileSync(atlasPath, encode(atlas));
  console.log(`atlas ${atlas.width}x${atlas.height} -> ${path.relative(ROOT, atlasPath)} (${(fs.statSync(atlasPath).size / 1024 / 1024).toFixed(2)} MB)`);
  const json = { src: '/motion-v3/hana-atlas-v3.png', width: atlas.width, height: atlas.height, clips: Object.fromEntries(clips.map(c => [c.id, c.frames])) };
  fs.writeFileSync(path.join(__dirname, 'motion-v3.json'), JSON.stringify(json, null, 1));
  const ts = [
    '// Generated by tools/sprites/extract.cjs from assets/sprites/_source/v3 — do not edit by hand.',
    '// rect = [x, y, w, h] in the atlas, foot = feet anchor in atlas pixels (bottom of the lowest solid paw row).',
    'export interface AtlasFrame { readonly rect: readonly [number, number, number, number]; readonly foot: readonly [number, number]; }',
    `export const V3_SRC = ${JSON.stringify(json.src)};`,
    `export const V3_FRAMES = {`,
    ...clips.map(c => `  ${JSON.stringify(c.id)}: [${c.frames.map(f => `{ rect: [${f.rect.join(', ')}], foot: [${f.foot.join(', ')}] }`).join(', ')}]`).join(',\n').split('\n'),
    '} as const satisfies Record<string, readonly AtlasFrame[]>;',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, 'src', 'assets', 'motion-v3.ts'), ts);
  console.log('wrote src/assets/motion-v3.ts');
}
main();
