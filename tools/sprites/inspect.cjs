'use strict';
// Usage: node tools/sprites/inspect.cjs <png...>  — prints alpha coverage and corner colours.
const fs = require('node:fs'); const { decode } = require('./png.cjs');
for (const file of process.argv.slice(2)) {
  const img = decode(fs.readFileSync(file)); const { width, height, data } = img;
  let opaque = 0, partial = 0, clear = 0; const corner = [];
  for (const [x, y] of [[2, 2], [width - 3, 2], [2, height - 3], [width - 3, height - 3], [width >> 1, 2]]) { const o = (y * width + x) * 4; corner.push([...data.subarray(o, o + 4)].join(',')); }
  for (let i = 3; i < data.length; i += 4) { if (data[i] === 255) opaque++; else if (data[i] === 0) clear++; else partial++; }
  const alphaHist = new Array(8).fill(0); for (let i = 3; i < data.length; i += 4) alphaHist[data[i] >> 5]++;
  console.log(`${file}: ${width}x${height} opaque=${(opaque / (width * height) * 100).toFixed(1)}% partial=${(partial / (width * height) * 100).toFixed(1)}% clear=${(clear / (width * height) * 100).toFixed(1)}% corners=[${corner.join(' | ')}] hist=${alphaHist.join('/')}`);
}
