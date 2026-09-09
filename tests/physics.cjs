const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DesktopController } = require('../.test-build/domain/desktop-controller.js');
const { STEP, BODY, integrateMotion, depenetrate, bodyRect, collisionScene } = require('../.test-build/domain/motion.js');
const { frameIndex, findSprite } = require('../.test-build/assets/manifest.js');
const ground = { workArea: { left: 0, top: 0, right: 1200, bottom: 760 }, obstacles: [], scaleFactor: 1 };
const browser = { id: 'browser', left: 264, top: 80, right: 840, bottom: 738 };
const desktop = { ...ground, obstacles: [browser] };
const state = (x, y = 760) => ({ x, y, velocityX: 0, velocityY: 0, grounded: y === 760 });
function pet(scene = ground) { const p = new DesktopController(scene, () => .5); p.autonomous = false; return p; }
function tick(p, seconds) { for (let i = 0; i < Math.round(seconds / STEP); i++) p.tick(STEP); }
function intersects(a, b) { return a.left < b.right - .5 && a.right > b.left + .5 && a.top < b.bottom - .5 && a.bottom > b.top + .5; }
test('spawn uses free taskbar ground beside the browser', () => {
  const p = pet(desktop); assert.equal(p.motion.y, 760); assert.equal(p.motion.supportId, 'ground');
  assert.equal(intersects(bodyRect(p.motion, 1), browser), false);
});
test('left and right walk keep feet on the taskbar', () => {
  const p = pet(); p.motion = state(500); p.request('walk', 'left'); tick(p, 1);
  assert(p.motion.x < 420); assert.equal(p.motion.y, 760);
  p.request('walk', 'right'); tick(p, 2); assert(p.motion.x > 580); assert.equal(p.motion.y, 760);
});
test('stationary jump launches exactly once and recovers after landing', () => {
  const p = pet(); p.motion = state(500); assert(p.request('jump')); assert.equal(p.request('jump'), false);
  let flights = 0, minimum = 760, previous = true;
  for (let i=0;i<360;i++) { p.tick(STEP); if (previous && !p.motion.grounded) flights++; previous = p.motion.grounded; minimum = Math.min(minimum,p.motion.y); }
  assert.equal(flights,1); assert(minimum < 670); assert.equal(p.motion.x,500);
  assert.equal(p.motion.y,760); assert.equal(p.action,'idle-stand'); assert.equal(p.motion.velocityY,0);
});
test('window sides stop motion and trigger grounded two-paw leaning', () => {
  for (const [x,facing,expected] of [[180,'right',browser.left-BODY.halfWidth],[940,'left',browser.right+BODY.halfWidth]]) {
    const p=pet(desktop); p.motion=state(x); p.request('walk',facing); tick(p,.8);
    assert.equal(p.action,'lean'); assert.equal(p.motion.x,expected); assert.equal(p.motion.y,760);
    assert.equal(p.motion.velocityX,0); assert.equal(p.motion.grounded,true);
  }
});
test('lean requires a real reachable window, not an imaginary wall', () => {
  const p=pet(); assert.equal(p.request('lean','right'),false); assert.equal(p.action,'idle-stand');
});
test('moving or minimizing the contacted browser releases the lean', () => {
  const p=pet(desktop);p.motion=state(browser.right+BODY.halfWidth);p.request('lean','left');p.setScene(ground);tick(p,.1);
  assert.equal(p.action,'idle-stand'); assert.equal(p.motion.grounded,true);
});
test('walking off a window top falls to the floor', () => {
  const scene={...ground,obstacles:[{id:'short',left:350,top:350,right:650,bottom:450}]};
  const p=pet(scene);p.motion={...state(640,350),grounded:true,supportId:'short'};p.request('walk','right');tick(p,3);
  assert.equal(p.motion.y,760);assert.equal(p.motion.supportId,'ground');
});
test('removing a supporting window drops Hana instead of floating', () => {
  const p=pet({...ground,obstacles:[{id:'shelf',left:300,top:400,right:700,bottom:500}]});
  p.motion={...state(500,400),grounded:true,supportId:'shelf'};p.setScene(ground);tick(p,2);
  assert.equal(p.motion.y,760);assert.equal(p.action,'idle-stand');
});
test('fast fall lands on the first crossed window top', () => {
  const scene={...ground,obstacles:[{id:'lower',left:200,top:600,right:700,bottom:650},{id:'upper',left:200,top:400,right:700,bottom:450}]};
  const r=integrateMotion({...state(500,200),velocityY:50000},scene,0,STEP);
  assert.equal(r.state.y,400);assert.equal(r.state.supportId,'upper');
});
test('upward jump hits window underside and falls back down', () => {
  const scene={...ground,obstacles:[{id:'ceiling',left:300,top:200,right:700,bottom:560}]};
  const p=pet(scene);p.motion=state(500);p.request('jump');let min=760;
  for(let i=0;i<240;i++){p.tick(STEP);min=Math.min(min,p.motion.y);}
  assert(min>=560+BODY.height);assert.equal(p.motion.y,760);
});
test('drag drop inside a moved browser resolves to a free side', () => {
  const s=depenetrate(state(500),desktop);assert.equal(intersects(bodyRect(s,1),browser),false);assert.equal(s.y,760);
});
test('negative monitor origins and 150% DPI use the same physical units', () => {
  const scale=1.5;const scene={workArea:{left:-1920,top:-100,right:0,bottom:980},obstacles:[],scaleFactor:scale};
  const p=pet(scene);p.motion={...state(-900,980),grounded:true};p.request('walk','left');tick(p,1);assert(p.motion.x < -1020);assert.equal(p.motion.y,980);
  p.request('jump');tick(p,2);assert.equal(p.motion.y,980);assert(p.motion.x<0);
});
test('screen edges turn Hana without leaving the work area', () => {
  const p=pet();p.motion=state(1128);p.request('walk','right');tick(p,.25);assert.equal(p.facing,'left');assert(p.motion.x<=1132);
});
test('maximized fallback is explicit and does not disable normal browser collision', () => {
  assert.equal(collisionScene(desktop).obstacles.length,1);
  assert.equal(collisionScene({...ground,obstacles:[{id:'maximized',...ground.workArea}]}).obstacles.length,0);
});
test('sprite frames depend on gait and physical jump phase', () => {
  assert.equal(frameIndex('walk',0,0),0);assert.equal(frameIndex('walk',.13,0),1);assert.equal(frameIndex('walk',.26,0),2);
  assert.equal(frameIndex('jump',.05,0),0);assert.equal(frameIndex('jump',.2,-400),1);assert.equal(frameIndex('fall',3,300),2);assert.equal(frameIndex('land',0,0),3);
  assert.equal(findSprite('walk','left').mirror,true);assert.equal(findSprite('walk','right').mirror,false);
});
