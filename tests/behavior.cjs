const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DesktopController } = require('../.test-build/domain/desktop-controller.js');
const { STEP, BODY, integrateMotion, wallContact } = require('../.test-build/domain/motion.js');
const { NeedsModel } = require('../.test-build/domain/needs.js');
const { PettingDetector } = require('../.test-build/domain/petting.js');
const { clipLength, findSprite, frameIndex, framePhase } = require('../.test-build/assets/manifest.js');
const A = { id: 'a', primary: true, scaleFactor: 1, workArea: { left: 0, top: 0, right: 1200, bottom: 760 } };
const twoMonitors = (bottomB) => ({ workArea: A.workArea, scaleFactor: 1, obstacles: [],
  monitors: [A, { id: 'b', scaleFactor: 1, workArea: { left: 1200, top: 0, right: 2400, bottom: bottomB } }] });
const ground = { workArea: A.workArea, obstacles: [], scaleFactor: 1 };
const state = (x, y = 760) => ({ x, y, velocityX: 0, velocityY: 0, grounded: true, supportId: 'ground' });
function pet(scene = ground, random = () => .5, needs) { const p = new DesktopController(scene, random, needs); p.autonomous = false; return p; }
function tick(p, seconds, ctx) { for (let i = 0; i < Math.round(seconds / STEP); i++) p.tick(STEP, ctx); }
const noon = (s = 5) => new Date(2026, 8, 10, 12, 0, s).getTime();
const afternoon = new Date(2026, 8, 10, 15, 20, 0).getTime();
function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

test('same-height neighbouring monitor is one continuous floor', () => {
  const p = pet(twoMonitors(760)); p.motion = state(1100); p.request('walk', 'right'); tick(p, 3);
  assert(p.motion.x > 1250, `crossed onto monitor b (x=${p.motion.x})`); assert.equal(p.motion.y, 760); assert.equal(p.facing, 'right'); assert.equal(p.motion.supportId, 'ground');
});
test('lower neighbouring floor: walk off the edge and land on the other monitor', () => {
  const p = pet(twoMonitors(800)); p.motion = state(1100); p.request('walk', 'right');
  let airborne = false; for (let i = 0; i < 360; i++) { p.tick(STEP); if (!p.motion.grounded) airborne = true; }
  assert(airborne); assert.equal(p.motion.y, 800); assert.equal(p.motion.supportId, 'ground'); assert(p.motion.x > 1200);
});
test('slightly higher neighbouring floor: hop up and keep walking', () => {
  const p = pet(twoMonitors(800)); p.motion = { ...state(1300, 800) }; p.request('walk', 'left');
  let peak = 800; for (let i = 0; i < 480; i++) { p.tick(STEP); peak = Math.min(peak, p.motion.y); }
  assert(peak < 760, 'left the lower floor'); assert.equal(p.motion.y, 760); assert(p.motion.x < 1200, `back on monitor a (x=${p.motion.x})`);
  assert.equal(p.action, 'walk'); assert.equal(p.facing, 'left');
});
test('a much higher bridged floor is leapt onto instead of being treated as a wall', () => {
  const p = pet(twoMonitors(600)); p.motion = state(1100); p.request('walk', 'right');
  let airborne = false; for (let i = 0; i < 120 * 4; i++) { p.tick(STEP); if (!p.motion.grounded) airborne = true; }
  assert(airborne, 'left the floor'); assert.equal(p.motion.y, 600); assert(p.motion.x > 1200, `on monitor b (x=${p.motion.x})`);
  assert.equal(p.action, 'walk'); assert.equal(p.facing, 'right', 'kept walking the same way');
});
test('only a real seam is crossed: stacked or gapped monitors and outer edges still turn Hana around', () => {
  const above = { workArea: A.workArea, scaleFactor: 1, obstacles: [], monitors: [A, { id: 'b', scaleFactor: 1, workArea: { left: 0, top: -800, right: 1200, bottom: 0 } }] };
  const p = pet(above); p.motion = state(1100); p.request('walk', 'right'); tick(p, 2);
  assert.equal(p.facing, 'left', 'a monitor above shares no vertical seam'); assert.equal(p.motion.y, 760);
  const gapped = { ...above, monitors: [A, { id: 'b', scaleFactor: 1, workArea: { left: 1300, top: 0, right: 2500, bottom: 600 } }] };
  const q = pet(gapped); q.motion = state(1100); q.request('walk', 'right'); tick(q, 2);
  assert.equal(q.facing, 'left', 'a gap is not a bridge'); assert(q.motion.x <= 1132);
  const r = pet(twoMonitors(760)); r.motion = state(2300, 760); r.request('walk', 'right'); tick(r, 1);
  assert.equal(r.facing, 'left', 'the far outer edge is still a wall'); assert(r.motion.x <= 2332);
});
test('walking off onto a lower floor resumes the walk after landing instead of stopping at the seam', () => {
  const p = pet(twoMonitors(800)); p.motion = state(1100); p.request('walk', 'right'); tick(p, 4);
  assert.equal(p.motion.y, 800); assert.equal(p.action, 'walk'); assert.equal(p.facing, 'right'); assert(p.motion.x > 1300, `deep into b (x=${p.motion.x})`);
  p.stopWalking(); assert.equal(p.action, 'idle-stand');
});
test('realistic dual-monitor layouts are crossable both ways while walking', () => {
  const layouts = [
    [[0, 0, 1920, 1020, 1.25], [1920, 0, 3840, 1032, 1]],   // 1080p@125% + 1080p@100%
    [[0, 0, 2560, 1392, 1], [2560, 0, 4480, 1032, 1]],       // 1440p + 1080p, top-aligned (360px step)
    [[0, 0, 2560, 1392, 1], [2560, 180, 4480, 1212, 1]],     // centre-aligned
    [[0, 0, 1920, 1008, 1.5], [1920, 0, 4480, 1392, 1]],     // laptop 150% + 1440p
    [[-1920, 0, 0, 1032, 1], [0, 0, 1920, 1032, 1]],         // secondary on the left
    [[0, 0, 3840, 2088, 1.5], [3840, 1080, 5760, 2112, 1]]   // 4K@150% + 1080p, bottom-aligned
  ];
  const mon = (id, r, primary) => ({ id, primary, scaleFactor: r[4], workArea: { left: r[0], top: r[1], right: r[2], bottom: r[3] } });
  for (const [a, b] of layouts) for (const dir of ['right', 'left']) {
    const p = pet({ workArea: mon('a', a, true).workArea, scaleFactor: a[4], obstacles: [], monitors: [mon('a', a, true), mon('b', b, false)] });
    const start = dir === 'right' ? { x: a[2] - 200 * a[4], y: a[3] } : { x: b[0] + 200 * b[4], y: b[3] };
    p.motion = { ...start, velocityX: 0, velocityY: 0, grounded: true, supportId: 'ground' }; p.request('walk', dir); tick(p, 8);
    const crossed = dir === 'right' ? p.motion.x > b[0] + 100 : p.motion.x < a[2] - 100;
    assert(crossed && p.facing === dir, `${JSON.stringify(a)} -> ${JSON.stringify(b)} ${dir}: x=${p.motion.x.toFixed(0)} y=${p.motion.y} ${p.action} ${p.facing}`);
  }
});
test('a window poking out from behind a maximized one only exists where it can be seen', () => {
  const B = { id: 'b', scaleFactor: 1, workArea: { left: 1200, top: 0, right: 2400, bottom: 760 } };
  const mail = { id: 'mail', left: 0, top: 0, right: 1200, bottom: 760 };          // maximized on monitor a: backdrop
  const browser = { id: 'browser', left: 900, top: 100, right: 1500, bottom: 700 }; // behind it, poking onto monitor b
  const scene = { workArea: A.workArea, scaleFactor: 1, obstacles: [mail, browser], monitors: [A, B] };
  const p = pet(scene);
  assert.equal(wallContact(state(900 - BODY.halfWidth), p.scene, 'right'), undefined, 'the hidden left face is not a wall');
  p.motion = state(700); p.request('walk', 'right'); tick(p, 4.7);
  assert.equal(p.motion.x, 1200 - BODY.halfWidth, 'stopped at the visible edge on the seam'); assert.equal(p.action, 'lean');
  assert.equal(p.drainEvents().find(e => e.type === 'lean')?.detail.includes('browser'), true, 'the lean is reported with its window');
});
test('integrateMotion reports the step height only when a higher floor blocks the way', () => {
  const scene = twoMonitors(800);
  const down = integrateMotion({ ...state(1131), velocityX: 95 }, scene, 95, STEP);
  assert.equal(down.stepUp, undefined); assert.equal(down.boundary, false, 'a lower neighbour never blocks');
  const up = integrateMotion({ ...state(1268, 800), velocityX: -95 }, scene, -95, STEP);
  assert.equal(up.stepUp, 40); assert.equal(up.boundary, true);
  const edge = integrateMotion({ ...state(68), velocityX: -95 }, scene, -95, STEP);
  assert.equal(edge.boundary, true); assert.equal(edge.stepUp, undefined, 'desktop edge has no neighbour');
});
test('random need shows a bubble on the roomier side and Hana begs on two legs until it expires', () => {
  const scene = { ...ground, obstacles: [{ id: 'browser', left: 620, top: 80, right: 1150, bottom: 738 }] };
  const needs = new NeedsModel(() => .9, { minGap: 1, maxGap: 1, needTtl: 2, reminderTtl: 3 });
  const p = pet(scene, () => .9, needs); p.autonomous = true; p.motion = state(540); p.settings.gaze = false;
  tick(p, 1.2, { now: afternoon });
  assert.equal(p.bubble?.kind, 'pet'); assert.equal(p.action, 'stand-up'); assert.equal(p.bubbleSide, 'left');
  assert.equal(p.drainEvents().some(e => e.type === 'need'), true);
  tick(p, 2.5, { now: afternoon }); assert.equal(p.bubble, undefined); assert.notEqual(p.action, 'stand-up');
});
test('lunch reminder fires once per day with a wall-clock bubble', () => {
  const needs = new NeedsModel(() => .5, { minGap: 999, maxGap: 999, needTtl: 2, reminderTtl: 3 });
  const p = pet(ground, () => .5, needs); p.settings.lunch = '12:00';
  p.tick(STEP, { now: noon(10) });
  assert.equal(p.bubble?.kind, 'clock'); assert.equal(p.bubble?.label, '12:00'); assert.equal(needs.fired.lunch, '2026-9-10');
  tick(p, 3.5, { now: noon(30) }); assert.equal(p.bubble, undefined);
  tick(p, .5, { now: noon(50) }); assert.equal(p.bubble, undefined, 'does not fire again the same day');
  p.settings.reminders = false; needs.fired = {}; tick(p, .5, { now: noon(55) }); assert.equal(p.bubble, undefined, 'disabled reminders stay quiet');
});
test('hover petting settles Hana down through sitting; the content face comes after 2 s and keeps her lying direction', () => {
  const p = pet(); p.motion = state(500); p.setPetting(true);
  assert.equal(p.action, 'sit', 'gets down through sitting'); assert.equal(p.transitioning, true);
  tick(p, .4); assert.equal(p.action, 'lie-front'); const side = p.facing; assert.notEqual(side, 'front');
  tick(p, 1.1); assert.equal(p.action, 'lie-front', 'still settling before 2 s');
  tick(p, .7); assert.equal(p.action, 'smile'); assert.equal(p.facing, side);
  assert.equal(findSprite('smile', side).mirror, findSprite('lie-front', side).mirror, 'smile mirrors like the lie it came from');
  p.setPetting(false); tick(p, 1); assert.equal(p.action, 'smile'); tick(p, 1); assert.equal(p.action, 'lie-front'); assert.equal(p.facing, side);
  const q = pet(); q.motion = state(500); q.setPetting(true); tick(q, 1); q.setPetting(false); tick(q, 3);
  assert.notEqual(q.action, 'smile', 'petting shorter than 2 s never reaches the content face');
});
test('crouch and lick are separate, chain into each other, and "rest" picks a rest pose', () => {
  const p = pet(); p.motion = state(500);
  assert(p.request('lick')); assert.equal(p.action, 'lick'); assert.equal(frameIndex('lick', p.age, 0), 0, 'from standing: settle intro first');
  tick(p, clipLength('lick') / 1000 + .05); assert.equal(p.action, 'crouch', 'lick ends curled up'); assert.equal(frameIndex('crouch', p.age, 0), 2, 'without replaying the settle');
  assert(p.request('lick')); assert.equal(frameIndex('lick', p.age, 0), 2, 'already curled: no intro');
  const rests = new Set(); const q = pet(ground, lcg(11)); q.motion = state(500);
  for (let i = 0; i < 30; i++) { rests.add(q.rest()); tick(q, .2); }
  for (const a of rests) assert(['sit', 'lie-front', 'lie-down', 'recline', 'crouch', 'yawn'].includes(a), a);
  assert(rests.size >= 4, [...rests].join(','));
});
test('petting answers a pet request; snack and toy answer theirs', () => {
  const needs = new NeedsModel(() => .9, { minGap: 1, maxGap: 1, needTtl: 30, reminderTtl: 3 });
  const p = pet(ground, () => .9, needs); p.settings.gaze = false; p.motion = state(500); tick(p, 1.2, { now: afternoon });
  assert.equal(needs.active, 'pet'); p.setPetting(true);
  assert.equal(needs.active, undefined); assert.equal(p.bubble, undefined);
  assert.equal(p.drainEvents().find(e => e.type === 'petting')?.detail, 'wanted');
  p.setPetting(false); p.settings.needs = false; tick(p, 2); needs.demand('snack'); assert.match(p.interact('snack'), /기다리던 간식/); tick(p, .5); assert.equal(p.action, 'lick', 'up through sitting, then curls to lick');
  tick(p, 6); needs.demand('toy'); assert.match(p.interact('toy'), /놀자/); assert.equal(p.action, 'jump');
  tick(p, 1.5); assert.equal(p.action, 'shake');
});
test('one-shot clips return to idle when their sequence ends', () => {
  const p = pet(); p.motion = state(500); assert(p.request('shake')); assert.equal(p.action, 'shake');
  tick(p, clipLength('shake') / 1000 + .05); assert.equal(p.action, 'idle-stand');
  assert(clipLength('yawn') > 3000); assert.equal(clipLength('sit'), Infinity);
});
test('a moving cursor nearby makes Hana sit facing it and look up or level; stillness ends it', () => {
  const p = pet(ground, () => 0); p.motion = state(500);
  for (let i = 0; i < 240; i++) p.tick(STEP, { cursor: { x: 700 + (i % 20) * 4, y: 500 } });
  assert.equal(p.action, 'sit'); assert.equal(p.facing, 'right'); assert.equal(p.frameOverride, 0, 'cursor above the head → looking up');
  for (let i = 0; i < 60; i++) p.tick(STEP, { cursor: { x: 300 + (i % 20) * 4, y: 740 } });
  assert.equal(p.facing, 'left'); assert.notEqual(p.frameOverride, 0);
  tick(p, 3.6, { cursor: { x: 300, y: 740 } }); assert.equal(p.action, 'idle-stand'); assert.equal(p.frameOverride, undefined);
});
test('gaze can be switched off and manual actions pause free roaming', () => {
  const p = pet(ground, () => 0); p.motion = state(500); p.settings.gaze = false;
  for (let i = 0; i < 240; i++) p.tick(STEP, { cursor: { x: 700 + (i % 20) * 4, y: 500 } });
  assert.equal(p.action, 'idle-stand');
  p.autonomous = true; p.holdAutonomy(10); p.request('lie-front', 'left'); tick(p, 8); assert.equal(p.action, 'lie-front');
});
test('free roaming includes standing on two legs and rest poses that end on their own', () => {
  const seen = new Set();
  const p = pet(ground, lcg(7)); p.autonomous = true; p.settings.gaze = false; p.settings.needs = false; p.motion = state(500);
  for (let i = 0; i < 120 * 600; i++) { p.tick(STEP, { now: afternoon }); seen.add(p.action); }
  for (const a of ['stand-up', 'walk', 'sit', 'lie-front', 'lie-down', 'recline', 'crouch', 'shake', 'yawn']) assert(seen.has(a), `${a} while wandering (${[...seen].join(',')})`);
  assert.equal(p.motion.y, 760, 'never leaves the taskbar floor');
  let restTicks = 0, total = 0; const r = pet(ground, lcg(5)); r.autonomous = true; r.settings.gaze = false; r.settings.needs = false; r.motion = state(500);
  for (let i = 0; i < 120 * 900; i++) { r.tick(STEP, { now: afternoon }); total++; if (['sit', 'lie-front', 'lie-down', 'recline', 'crouch', 'yawn', 'lick'].includes(r.action)) restTicks++; }
  assert(restTicks / total > .3, `rests at least 30% of the time (${(restTicks / total * 100).toFixed(0)}%)`);
});
test('petting detector needs a stroke, not a pass-through', () => {
  const d = new PettingDetector();
  for (let i = 0; i < 12; i++) d.move(i * .04, { x: 100 + i * 6, y: 50 });
  assert.equal(d.active, false, 'straight pass-through is not petting');
  for (let i = 0; i < 16; i++) d.move(1 + i * .04, { x: 120 + Math.sin(i / 2) * 22, y: 50 + (i % 2) });
  assert.equal(d.active, true);
  d.update(1.7, true); assert.equal(d.active, true); d.update(2.8, true); assert.equal(d.active, false, 'stroke ended by stillness');
});
test('side art mirrors by facing and clip cycles follow their durations', () => {
  assert.equal(findSprite('sit', 'right').mirror, true); assert.equal(findSprite('sit', 'left').mirror, false);
  assert.equal(findSprite('lie-front', 'left').mirror, true); assert.equal(findSprite('recline', 'right').mirror, false);
  assert.equal(findSprite('shake', 'left').mirror, false);
  assert.equal(frameIndex('lie-down', .1, 0), 4); assert.equal(frameIndex('lie-down', 1.2, 0), 6);
  assert.equal(frameIndex('shake', 0, 0), 0); assert.equal(frameIndex('shake', 99, 0), 7, 'finished one-shot holds its last frame');
  assert.equal(frameIndex('smile', 0, 0), 1);
});

test('pose changes pass through the poses a dog really uses: getting-up frames, sitting between lying and standing', () => {
  const p = pet(); p.motion = state(500);
  p.request('crouch'); tick(p, 1); assert.equal(frameIndex('crouch', p.age, 0), 2, 'settled');
  p.request('idle-stand');
  assert.equal(p.action, 'crouch', 'still curled while getting up'); assert.equal(p.transitioning, true);
  assert.equal(p.frameOverride, 1, 'settle-in played backwards: the rising frame first');
  tick(p, .3); assert.equal(p.frameOverride, 0, 'then the standing frame');
  tick(p, .2); assert.equal(p.action, 'idle-stand'); assert.equal(p.transitioning, false); assert.equal(p.frameOverride, undefined);
  p.request('lie-down', 'left'); assert.equal(p.action, 'sit', 'settles through sitting'); assert.equal(p.facing, 'left');
  tick(p, .4); assert.equal(p.action, 'lie-down'); assert.equal(frameIndex('lie-down', p.age, 0), 4, 'then its own head-lowering intro');
  tick(p, 2); p.request('lie-front', 'left');
  assert.equal(p.action, 'lie-down'); assert.equal(p.frameOverride, 4, 'the head lifts before the head-up lie');
  tick(p, .3); assert.equal(p.action, 'lie-front'); assert.equal(p.facing, 'left');
  p.request('walk', 'right'); assert.equal(p.action, 'sit', 'gets up through sitting'); tick(p, .45); assert.equal(p.action, 'walk');
  p.request('jump'); assert.equal(p.action, 'jump', 'physics never waits for choreography');
  const lying = (x) => ['lie-front', 'lie-down', 'recline', 'yawn', 'smile'].includes(x), upright = (x) => ['idle-stand', 'walk', 'stand-up', 'shake', 'crouch', 'lick'].includes(x);
  const q = pet(ground, lcg(9)); q.autonomous = true; q.settings.gaze = false; q.settings.needs = false; q.motion = state(500);
  let cuts = 0, last = q.action;
  for (let i = 0; i < 120 * 600; i++) { q.tick(STEP, { now: afternoon }); const a = q.action; if (a !== last) { if ((lying(last) && upright(a)) || (upright(last) && lying(a))) cuts++; last = a; } }
  assert.equal(cuts, 0, 'free roaming never cuts straight between lying and upright');
});
test('smooth clips dissolve into their next frame; gaits and shakes cut', () => {
  const a = framePhase('lick', .75 + .29, 0); assert.equal(a.index, 2); assert.equal(a.next, 3); assert(a.blend > .9, 'end of the first lick step blends toward the tongue frame');
  const b = framePhase('lick', .75 + .05, 0); assert.equal(b.index, 2); assert.equal(b.blend, 0, 'start of a step is crisp');
  const w = framePhase('walk', .13, 0); assert.equal(w.index, 1); assert.equal(w.blend, 0); assert.equal(w.next, undefined);
  assert.equal(framePhase('shake', .3, 0).blend, 0);
  const e = framePhase('shake', 99, 0); assert.equal(e.index, 7); assert.equal(e.blend, 0, 'a finished one-shot holds without blending');
});
test('focus mode moves Hana clear of windows, hides her when nothing fits, and brings her back', () => {
  const browser = { id: 'browser', left: 300, top: 80, right: 900, bottom: 738 };
  const clear = (p) => p.motion.x < 300 - 68 - 24 || p.motion.x > 900 + 68 + 24;
  const p = pet({ ...ground, obstacles: [browser] }, lcg(3)); p.motion = state(600);
  p.settings.focus = true; p.tick(STEP, { now: afternoon });
  assert.equal(p.hidden, false); assert(clear(p), `parked beside the browser (x=${p.motion.x})`);
  assert.equal(p.action, 'lie-down'); assert.equal(p.motion.y, 760);
  p.setScene({ ...ground, obstacles: [{ id: 'maximized', left: 0, top: 0, right: 1200, bottom: 760 }] }); tick(p, .6, { now: afternoon });
  assert.equal(p.hidden, true, 'no clear spot on a maximized window');
  p.setScene({ ...ground, obstacles: [browser] }); tick(p, 2.2, { now: afternoon });
  assert.equal(p.hidden, false, 'returns once a spot has been clear for a moment'); assert.equal(p.motion.y, 760);
  p.autonomous = true; p.settings.needs = true; tick(p, 40, { now: afternoon });
  assert.equal(p.bubble, undefined, 'no bubbles while focused'); assert.equal(p.motion.y, 760); assert(clear(p), 'still clear of the browser');
  p.settings.focus = false; p.tick(STEP, { now: afternoon });
  assert.equal(p.hidden, false); assert.equal(p.action, 'idle-stand'); assert(clear(p), 'returned to a clear spot');
});
