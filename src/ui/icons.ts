import type { BubbleKind } from "../domain/needs";
/**
 * Thought-bubble icons as small SVG illustrations (64×64), styled to Hana's warm palette instead of emoji.
 * The canvas renders them through an <img>; the action panel inlines the same markup, so both match.
 * Shapes that need a single outline are drawn twice: once thick in the outline colour, once filled on top.
 */
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${body}</svg>`;
const BONE_SHAPES = `<circle cx="17" cy="25" r="7.2"/><circle cx="17" cy="39" r="7.2"/><circle cx="47" cy="25" r="7.2"/><circle cx="47" cy="39" r="7.2"/><rect x="16" y="26.5" width="32" height="11" rx="3"/>`;
const HAND_SHAPES = `<rect x="17" y="27" width="30" height="24" rx="9"/><rect x="17.5" y="11" width="7.4" height="23" rx="3.7"/><rect x="26" y="5" width="7.4" height="29" rx="3.7"/><rect x="34.5" y="6.5" width="7.4" height="27" rx="3.7"/><rect x="43" y="13" width="6.8" height="21" rx="3.4"/><rect x="7" y="31" width="7.4" height="18" rx="3.7" transform="rotate(-38 10.7 40)"/>`;
const ticks = () => Array.from({ length: 12 }, (_, i) => {
  const a = i * Math.PI / 6, major = i % 3 === 0, r0 = major ? 15.5 : 17, r1 = 19;
  const x0 = 32 + Math.sin(a) * r0, y0 = 35 - Math.cos(a) * r0, x1 = 32 + Math.sin(a) * r1, y1 = 35 - Math.cos(a) * r1;
  return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#7a5a48" stroke-width="${major ? 2.2 : 1.3}" stroke-linecap="round"/>`;
}).join("");
export const ICON_SVG: Record<BubbleKind, string> = {
  snack: svg(`<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#ead0a8"/></linearGradient></defs>
<g transform="rotate(-22 32 32)"><g fill="#a9784b" stroke="#a9784b" stroke-width="5" stroke-linejoin="round">${BONE_SHAPES}</g><g fill="url(#bg)">${BONE_SHAPES}</g>
<path d="M22 29.5c6-2 14-2 20 0" stroke="#ffffff" stroke-opacity=".85" stroke-width="2.4" stroke-linecap="round" fill="none"/>
<path d="M24 36.5c5 1.4 11 1.4 16 0" stroke="#c9a273" stroke-opacity=".7" stroke-width="1.5" stroke-linecap="round" fill="none"/></g>`),
  toy: svg(`<defs><radialGradient id="tb" cx=".38" cy=".3" r=".78"><stop offset="0" stop-color="#f6fc9a"/><stop offset=".55" stop-color="#d3e34e"/><stop offset="1" stop-color="#94a826"/></radialGradient></defs>
<circle cx="32" cy="33" r="22" fill="url(#tb)" stroke="#6b7a1a" stroke-width="2.4"/>
<path d="M17 17c13 9 13 23 0 32" fill="none" stroke="#fffdf0" stroke-width="3.4" stroke-linecap="round"/>
<path d="M47 17c-13 9-13 23 0 32" fill="none" stroke="#fffdf0" stroke-width="3.4" stroke-linecap="round"/>
<ellipse cx="25" cy="21" rx="6" ry="3.2" fill="#ffffff" opacity=".4" transform="rotate(-32 25 21)"/>`),
  pet: svg(`<defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe4cd"/><stop offset="1" stop-color="#f2b58f"/></linearGradient></defs>
<g fill="#b97a53" stroke="#b97a53" stroke-width="5" stroke-linejoin="round">${HAND_SHAPES}</g><g fill="url(#hg)">${HAND_SHAPES}</g>
<path d="M23 42.5c5 3 13 3 18 0" stroke="#d9987a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<path d="M54 24c3 3 3 9 0 12M58 19.5c5 5.5 5 15.5 0 21" stroke="#c98a6a" stroke-width="2" fill="none" stroke-linecap="round" opacity=".85"/>
<path d="M55 9.5c-1.8-2.4-5.5-.9-4.9 2 .5 2.4 3.4 4 4.9 5.3 1.5-1.3 4.4-2.9 4.9-5.3.6-2.9-3.1-4.4-4.9-2z" fill="#f28aa4"/>`),
  clock: svg(`<defs><radialGradient id="cf" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f1e8dc"/></radialGradient></defs>
<path d="M32 5.5l-5.5 6.5h11z" fill="#5b3d2e"/><circle cx="32" cy="35" r="24" fill="#5b3d2e"/><circle cx="32" cy="35" r="20.5" fill="url(#cf)"/>${ticks()}`)
};
/** Clock geometry inside the 64-unit icon: face centre and hand lengths, so the canvas can draw the hands over the SVG face. */
export const CLOCK = { cx: 32, cy: 35, hour: 9.5, minute: 14 };
