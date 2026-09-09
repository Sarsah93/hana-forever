'use strict';
// Renders every clip at its runtime scale on one baseline so body sizes can be compared by eye.
//   node tools/sprites/calibrate.cjs  -> docs/previews/size-calibration.png
// Scales come from tools/sprites/calibration.json and must match src/assets/manifest.ts.
const fs = require('node:fs');
const path = require('node:path');
const { decode, encode, create, blit, fill } = require('./png.cjs');
const ROOT = path.resolve(__dirname, '..', '..');
const scales = JSON.parse(fs.readFileSync(path.join(__dirname, 'calibration.json'), 'utf8'));
const v3 = JSON.parse(fs.readFileSync(path.join(__dirname, 'motion-v3.json'), 'utf8'));
const atlasV2 = decode(fs.readFileSync(path.join(ROOT, 'assets/sprites/motion-v2/hana-atlas.png')));
const atlasV3 = decode(fs.readFileSync(path.join(ROOT, 'assets/sprites/motion-v3/hana-atlas-v3.png')));
const standUp = decode(fs.readFileSync(path.join(ROOT, 'assets/sprites/stand-up/front-v1.png')));
// motion-v2 rects/feet as registered in manifest.ts
const V2 = {
  idle: { rect: [60, 19, 195, 294], foot: [157, 306] },
  walk: { rect: [19, 347, 289, 240], foot: [162, 575] },
  lean: { rect: [994, 594, 224, 330], foot: [1078, 917] },
  jump: { rect: [673, 924, 222, 229], foot: [784, 1141] }
};
const items = [
  ['idle(v2)', atlasV2, V2.idle, scales.idle], ['walk(v2)', atlasV2, V2.walk, scales.walk], ['jump-air(v2)', atlasV2, V2.jump, scales.jump],
  ['stand-up', standUp, { rect: [0, 0, 1024, 1024], foot: [512, 980] }, scales['stand-up']],
  ...['front-shake:0', 'front-shake:3', 'crouch-lick:0', 'crouch-lick:7', 'crouch-lick:1', 'crouch-lick:2', 'scratch:6', 'scratch:2', 'recline-back:0', 'lie-front:0', 'lie-front:5', 'yawn:0', 'yawn:5']
    .map(key => { const [clip, i] = key.split(':'); return [key, atlasV3, v3.clips[clip][Number(i)], scales[clip]]; })
];
const BASE = 300, GAP = 14; let x = GAP, width = GAP;
for (const [, , f, s] of items) width += Math.round(f.rect[2] * s) + GAP;
const sheet = create(Math.max(width, 400), BASE + 40);
fill(sheet, 246, 242, 236, 255);
for (let gy = BASE; gy > 0; gy -= 50) fill(sheet, 205, 200, 190, 255, { top: gy, bottom: gy + 1 });
for (let gx = 0; gx < sheet.width; gx += 50) fill(sheet, 205, 200, 190, 255, { left: gx, right: gx + 1 });
fill(sheet, 190, 80, 60, 255, { top: BASE, bottom: BASE + 2 });
const report = [];
for (const [name, img, f, s] of items) {
  const [sx, sy, sw, sh] = f.rect, [fx, fy] = f.foot;
  const w = Math.round(sw * s), h = Math.round(sh * s);
  const dx = x, dy = BASE - Math.round((fy - sy) * s);
  blit(sheet, img, dx, dy, { sx, sy, sw, sh, scale: s });
  fill(sheet, 40, 110, 220, 255, { left: dx + Math.round((fx - sx) * s) - 2, right: dx + Math.round((fx - sx) * s) + 2, top: BASE - 6, bottom: BASE + 6 });
  report.push(`${name.padEnd(14)} scale=${s} -> ${w}x${h} css px`);
  x += w + GAP;
}
fs.mkdirSync(path.join(ROOT, 'docs/previews'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs/previews/size-calibration.png'), encode(sheet));
console.log(report.join('\n'));
console.log('order left->right: ' + items.map(i => i[0]).join(' | '));
