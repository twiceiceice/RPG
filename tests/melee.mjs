import assert from 'node:assert/strict';
import { Hunting } from '../dist/combat.js';
import { Movement, overlaps } from '../dist/movement.js';
import * as THREE from '../dist/vendor/three.module.js';
import { createAvatar } from '../dist/environment.js';
import { WarriorView } from '../dist/warrior-view.js';
const forward={x:0,z:1};
function setup(walls=[]){const h=new Hunting(walls);h.entities=[];h.equip('axe');const p=new Movement(walls);p.x=p.y=p.z=0;return {h,p,w:h.warrior};}
function enemy(s,x=0,z=2){const e=new Hunting().entities.find(e=>e.kind==='slime');Object.assign(e,{id:`target-${s.h.entities.length}`,x,y:0,z,homeX:x,homeZ:z,hp:500,maxHp:500,stagger:100});s.h.entities.push(e);return e;}
function run(s,seconds,auto=false,input={x:0,z:0}){for(let i=0;i<Math.round(seconds*120);i++){s.w.movement(input,s.p);s.p.update(1/120,input);s.h.update(1/120,s.p);if(auto)s.h.autoAttack(s.p);}}
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
test('charge travels exactly 50 percent farther in the same time and still collides with thin walls',()=>{
  const s=setup();s.w.request('charge',s.p,forward);run(s,.53);assert.ok(Math.abs(s.p.z-6.6*1.5)<1e-9);assert.equal(s.w.active,null);
  const wall={minX:-2,maxX:2,minZ:4,maxZ:4.04,bottom:0,top:4},b=setup([wall]);b.w.request('charge',b.p,forward);run(b,.52);assert.ok(b.p.z<4);assert.ok(!overlaps(b.p.x,b.p.z,wall,.3399));
});
test('slam deals 39, or 78 on a vulnerable enemy, exactly once per cast',()=>{
  const s=setup(),a=enemy(s,-.4,2),b=enemy(s,.4,2);s.h.applyOffBalance(b,4);s.w.request('slam',s.p,forward);run(s,1.1);assert.equal(a.hp,461);assert.equal(b.hp,422);assert.equal(b.offBalance,0);assert.ok(s.w.planted);
});
test('axe attacks nearby creatures automatically on its normal cadence, never empty space',()=>{
  const s=setup();run(s,.8,true);assert.equal(s.h.autoMelee.attacks,0);const e=enemy(s);run(s,.3,true);assert.equal(e.hp,476);assert.equal(s.h.autoMelee.attacks,1);run(s,.3,true);assert.equal(s.h.autoMelee.attacks,1);run(s,1.8,true);assert.equal(s.h.autoMelee.attacks,2);assert.equal(e.hp,452);
  e.x=20;run(s,.8,true);const n=s.h.autoMelee.attacks;run(s,1,true);assert.equal(s.h.autoMelee.attacks,n);
});
test('automatic sword attacks face the nearest target even to the side or behind',()=>{
  const s=setup();s.h.equip('sword');const near=enemy(s,-1.5,-.5),far=enemy(s,0,2.4);assert.ok(s.h.autoAttack(s.p));assert.equal(near.hp,468);assert.equal(far.hp,500);assert.ok(s.h.meleeFacing.x<-.9);assert.ok(s.h.meleeFacing.z<0);assert.equal(s.h.autoMelee.attacks,1);assert.equal(s.h.autoAttack(s.p),false);
});
test('auto target selection respects walls, vertical range, dead targets and weapon range',()=>{
  const wall={minX:.6,maxX:.7,minZ:-1,maxZ:1,bottom:0,top:4},s=setup([wall]);s.h.equip('sword');const blocked=enemy(s,1.5,0),valid=enemy(s,0,2);assert.ok(s.h.autoAttack(s.p));assert.equal(blocked.hp,500);assert.equal(valid.hp,468);
  for(const mutate of [e=>e.y=4,e=>e.alive=false,e=>e.z=5]){const b=setup();const e=enemy(b);mutate(e);assert.equal(b.h.autoAttack(b.p),false);assert.equal(b.w.active,null);}
});
test('automatic melee preserves movement and valid skill inputs immediately take priority',()=>{
  const s=setup();enemy(s);s.p.vx=3;s.p.vz=2;s.p.jumpBuffer=.1;assert.ok(s.h.autoAttack(s.p));assert.equal(s.p.vx,3);assert.equal(s.p.jumpBuffer,.1);const input={x:1,z:0};s.w.movement(input,s.p);assert.equal(input.forcedVelocity,null);
  assert.equal(s.w.request('kick',s.p,forward).accepted,false);assert.equal(s.w.active.id,'slash');
  assert.ok(s.w.request('slam',s.p,forward).accepted);assert.equal(s.w.active.id,'slam');assert.equal(s.h.cooldown,0);run(s,.7,true);assert.equal(s.h.entities[0].hp,461);assert.equal(s.h.autoMelee.attacks,1);
});
test('axe target selection uses the actual strike height behind a low barrier',()=>{
  const s=setup([{minX:-2,maxX:2,minZ:.3,maxZ:.4,bottom:0,top:.96}]);enemy(s,0,2);assert.equal(s.h.autoAttack(s.p),false);assert.equal(s.w.active,null);
});
test('skills, planted follow-ups and live combo windows reserve priority over auto attacks',()=>{
  const s=setup();enemy(s);s.w.request('charge',s.p,forward);run(s,.6,true);assert.equal(s.w.combo.step,1);assert.equal(s.h.autoMelee.attacks,0);run(s,.4,true);assert.equal(s.h.autoMelee.attacks,0);
  s.w.request('slam',s.p,forward);run(s,1.3,true);assert.ok(s.w.planted);assert.equal(s.h.autoMelee.attacks,0);s.w.request('sweep',s.p,forward);run(s,.95,true);assert.equal(s.w.active.id,'sweep');assert.equal(s.h.autoMelee.attacks,0);
});
test('bows, dead players, airborne players and trees alone do not initiate auto attacks',()=>{
  for(const change of [s=>s.h.equip('bow'),s=>s.h.hp=0,s=>s.p.grounded=false]){const s=setup();enemy(s);change(s);assert.equal(s.h.autoAttack(s.p),false);assert.equal(s.h.autoMelee.attacks,0);}
  const s=setup();s.h.forestry.trees=[{id:'tree-only',kind:'tree',x:0,y:0,z:2,hp:160,alive:true,radius:.5,height:3,hop:0}];assert.equal(s.h.autoAttack(s.p),false);assert.equal(s.w.active,null);
});
test('dead creatures are dropped and another live creature can receive the next automatic swing',()=>{
  const s=setup();s.h.equip('sword');const a=enemy(s,0,1),b=enemy(s,0,-2);a.hp=24;s.h.autoAttack(s.p);assert.equal(a.alive,false);run(s,2.05,true);assert.equal(s.h.autoMelee.attacks,2);assert.equal(b.hp,468);s.h.restorePlayer();assert.equal(s.h.autoMelee.attacks,0);assert.equal(s.h.autoAttackRecovery,false);
});
test('sweep has a deep body windup, horizontal cut, broad layered arc and visible follow-through',()=>{
  const s=setup(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),avatar=createAvatar(scene),view=new WarriorView(scene,camera,avatar,s.w);
  s.w.request('slam',s.p,forward);run(s,1.1);s.w.request('sweep',s.p,forward);run(s,.85*2/3);view.update(0,false,s.p,true);assert.ok(avatar.body.rotation.y<-1.2);assert.ok(avatar.body.position.y<-.2);assert.equal(view.sweepVfx.visible,false);
  run(s,.23*2/3);view.update(.016,false,s.p,false);assert.equal(view.sweepVfx.visible,true);assert.equal(view.sweepBands.length,3);assert.ok(view.sweepBands[0].geometry.drawRange.count>190);assert.ok(view.trail.material.opacity>.7);
  const normal=new THREE.Vector3(0,0,1).applyQuaternion(view.axe.quaternion);assert.ok(Math.abs(normal.y)>.99);run(s,.15*2/3);view.update(0,true,s.p,true);assert.ok(avatar.body.rotation.y>2);assert.ok(view.firstAxe.position.x<-.7);assert.ok(view.firstAxe.position.toArray().every(Number.isFinite));
  s.w.cancel();view.update(0,false,s.p,true);assert.equal(view.sweepVfx.visible,false);s.h.attack(s.p,forward);run(s,.26);view.update(0,false,s.p,true);assert.equal(view.sweepVfx.visible,false);assert.ok(view.trail.material.opacity<.4);
});
console.log(`${count} melee update checks passed.`);
