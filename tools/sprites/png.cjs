'use strict';
// Minimal dependency-free PNG codec (8/16-bit gray/RGB/indexed/alpha, non-interlaced).
// Decodes to RGBA8; encodes RGBA8 with adaptive per-row filtering.
const zlib = require('node:zlib');
const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; }
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, depth = 8, type = 6, interlace = 0, palette = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), name = buf.toString('latin1', pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (name === 'PLTE') palette = body; else if (name === 'tRNS') trns = body; else if (name === 'IDAT') idat.push(body); else if (name === 'IEND') break;
    pos += 12 + len;
  }
  if (interlace) throw new Error('interlaced PNG unsupported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const bps = depth === 16 ? 2 : 1, bpp = Math.max(1, channels * bps);
  const stride = Math.ceil(width * channels * depth / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride), off = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[off++]; cur.set(raw.subarray(off, off + stride)); off += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) cur[i] = (cur[i] + a) & 255; else if (filter === 2) cur[i] = (cur[i] + b) & 255;
      else if (filter === 3) cur[i] = (cur[i] + ((a + b) >> 1)) & 255; else if (filter === 4) cur[i] = (cur[i] + paeth(a, b, c)) & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const sample = (ch) => depth === 16 ? cur[(x * channels + ch) * 2] : depth === 8 ? cur[x * channels + ch] :
        ((cur[Math.floor(x * depth / 8)] >> (8 - depth - (x * depth) % 8)) & ((1 << depth) - 1)) * (type === 3 ? 1 : 255 / ((1 << depth) - 1));
      if (type === 6) { out[o] = sample(0); out[o + 1] = sample(1); out[o + 2] = sample(2); out[o + 3] = sample(3); }
      else if (type === 2) { out[o] = sample(0); out[o + 1] = sample(1); out[o + 2] = sample(2); out[o + 3] = 255; }
      else if (type === 0) { out[o] = out[o + 1] = out[o + 2] = sample(0); out[o + 3] = 255; }
      else if (type === 4) { out[o] = out[o + 1] = out[o + 2] = sample(0); out[o + 3] = sample(1); }
      else if (type === 3) { const i = sample(0); out[o] = palette[i * 3]; out[o + 1] = palette[i * 3 + 1]; out[o + 2] = palette[i * 3 + 2]; out[o + 3] = trns && i < trns.length ? trns[i] : 255; }
    }
    [prev, cur] = [cur, prev];
  }
  return { width, height, data: out };
}
function chunk(name, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const nb = Buffer.concat([Buffer.from(name, 'latin1'), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(nb));
  return Buffer.concat([len, nb, crc]);
}
function encode({ width, height, data }) {
  const stride = width * 4, raw = Buffer.alloc((stride + 1) * height);
  const zero = new Uint8Array(stride);
  const tries = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)];
  for (let y = 0; y < height; y++) {
    const cur = data.subarray(y * stride, (y + 1) * stride), prev = y ? data.subarray((y - 1) * stride, y * stride) : zero;
    let best = 0, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const t = tries[f]; let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? cur[i - 4] : 0, b = prev[i], c = i >= 4 ? prev[i - 4] : 0;
        const v = f === 0 ? cur[i] : f === 1 ? cur[i] - a : f === 2 ? cur[i] - b : f === 3 ? cur[i] - ((a + b) >> 1) : cur[i] - paeth(a, b, c);
        t[i] = v & 255; score += Math.abs((v << 24) >> 24);
      }
      if (score < bestScore) { bestScore = score; best = f; }
    }
    raw[y * (stride + 1)] = best; raw.set(tries[best], y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const create = (width, height) => ({ width, height, data: new Uint8Array(width * height * 4) });
/** Area-averaging downsample / bilinear upsample of an RGBA image, alpha-weighted to avoid dark fringes. */
function resize(img, width, height) {
  const out = create(width, height), sx = img.width / width, sy = img.height / height;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const x0 = x * sx, x1 = (x + 1) * sx, y0 = y * sy, y1 = (y + 1) * sy;
    let r = 0, g = 0, b = 0, a = 0, total = 0;
    for (let py = Math.floor(y0); py < Math.min(img.height, Math.ceil(y1)); py++) {
      const wy = Math.min(py + 1, y1) - Math.max(py, y0); if (wy <= 0) continue;
      for (let px = Math.floor(x0); px < Math.min(img.width, Math.ceil(x1)); px++) {
        const wx = Math.min(px + 1, x1) - Math.max(px, x0); if (wx <= 0) continue;
        const w = wx * wy, o = (py * img.width + px) * 4, pa = img.data[o + 3] / 255 * w;
        r += img.data[o] * pa; g += img.data[o + 1] * pa; b += img.data[o + 2] * pa; a += pa; total += w;
      }
    }
    const o = (y * width + x) * 4;
    if (a > 0) { out.data[o] = r / a; out.data[o + 1] = g / a; out.data[o + 2] = b / a; out.data[o + 3] = Math.round(a / total * 255); }
  }
  return out;
}
/** Source-over blit of a source rect with uniform scale (bilinear) and optional horizontal mirror. */
function blit(dst, src, dx, dy, opts = {}) {
  const { sx = 0, sy = 0, sw = src.width, sh = src.height, scale = 1, mirror = false } = opts;
  const w = Math.round(sw * scale), h = Math.round(sh * scale);
  const sample = (u, v, c) => {
    const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(u))), y0 = Math.max(0, Math.min(src.height - 1, Math.floor(v)));
    const x1 = Math.min(src.width - 1, x0 + 1), y1 = Math.min(src.height - 1, y0 + 1), tx = Math.min(1, Math.max(0, u - x0)), ty = Math.min(1, Math.max(0, v - y0));
    const p = (xx, yy) => src.data[(yy * src.width + xx) * 4 + c];
    return (p(x0, y0) * (1 - tx) + p(x1, y0) * tx) * (1 - ty) + (p(x0, y1) * (1 - tx) + p(x1, y1) * tx) * ty;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ox = dx + x, oy = dy + y; if (ox < 0 || oy < 0 || ox >= dst.width || oy >= dst.height) continue;
    const u = sx + ((mirror ? (w - 1 - x) : x) + .5) / scale - .5, v = sy + (y + .5) / scale - .5;
    const a = sample(u, v, 3) / 255; if (a <= 0.002) continue;
    const o = (oy * dst.width + ox) * 4, da = dst.data[o + 3] / 255, na = a + da * (1 - a);
    for (let c = 0; c < 3; c++) dst.data[o + c] = (sample(u, v, c) * a + dst.data[o + c] * da * (1 - a)) / (na || 1);
    dst.data[o + 3] = Math.round(na * 255);
  }
}
function fill(img, r, g, b, a = 255, rect) {
  const { left = 0, top = 0, right = img.width, bottom = img.height } = rect || {};
  for (let y = Math.max(0, top); y < Math.min(img.height, bottom); y++) for (let x = Math.max(0, left); x < Math.min(img.width, right); x++) { const o = (y * img.width + x) * 4; img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a; }
}
module.exports = { decode, encode, create, resize, blit, fill };
