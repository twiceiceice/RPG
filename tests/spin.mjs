import assert from 'node:assert/strict';
import { Movement, overlaps } from '../dist/movement.js';
import { Hunting } from '../dist/combat.js';
import { SPIN } from '../dist/warrior.js';
import * as THREE from '../dist/vendor/three.module.js';
import { createAvatar } from '../dist/environment.js';
import { WarriorView } from '../dist/warrior-view.js';
const forward={x:0,z:1};
function setup(colliders=[]) {const p=new Movement(colliders);p.x=p.y=p.z=0;const h=new Hunting(colliders);h.entities=[];h.equip('axe');h.warrior.kickPower.random=()=>.999;return {p,h,w:h.warrior};}
function enemy(s,x=0,z=5,hp=500) {const e=new Hunting().entities.find(e=>e.kind==='slime');Object.assign(e,{id:`target-${s.h.entities.length}`,x,y:0,z,homeX:x,homeZ:z,hp,maxHp:hp,stagger:100});s.h.entities.push(e);return e;}
function run(s,seconds,input={x:0,z:0}) {for(let i=0;i<Math.round(seconds*120);i++){s.w.movement(input,s.p);s.p.update(1/120,input);s.h.update(1/120,s.p);}}
function combo(s) {assert.ok(s.w.request('charge',s.p,forward).accepted);s.w.request('slam',s.p,forward);run(s,.55);s.w.request('kick',s.p,forward);run(s,1.1);s.w.request('sweep',s.p,forward);run(s,2.9);}
function spin(s) {s.w.ultimate.ready=true;assert.ok(s.w.request('spin',s.p,forward).accepted);}
let count=0;function test(name,fn){fn();console.log('PASS '+name);count++;}

test('a real four-hit combo unlocks exactly one stored ultimate, including a lethal final sweep',()=>{
 const s=setup(),e=enemy(s,0,5,72);assert.equal(s.w.request('spin',s.p,forward).accepted,false);combo(s);
 assert.equal(e.alive,false);assert.equal(s.w.ultimate.ready,true);assert.equal(s.w.state().combo.step,4);
 run(s,5,{x:1,z:0});s.h.damagePlayer(12);s.h.equip('sword');run(s,.2);s.h.equip('axe');assert.ok(s.w.ultimate.ready);
 assert.ok(s.w.request('spin',s.p,forward).accepted);assert.equal(s.w.ultimate.ready,false);run(s,2.6);assert.equal(s.w.active,null);assert.equal(s.w.request('spin',s.p,forward).accepted,false);
});
test('misses and timer expiration break the chain; skipping kick completes a short route',()=>{
 const s=setup();s.w.request('charge',s.p,forward);run(s,.6);assert.equal(s.w.combo.step,0);assert.match(s.w.combo.failure,/빗나/);
 const t=setup();enemy(t);t.w.request('charge',t.p,forward);run(t,.55);assert.equal(t.w.combo.step,1);
 assert.equal(t.w.request('kick',t.p,forward).accepted,false);assert.equal(t.w.request('spin',t.p,forward).accepted,false);assert.equal(t.w.combo.step,1);
 t.w.request('slam',t.p,forward);run(t,1.1);assert.equal(t.w.combo.step,2);t.w.request('sweep',t.p,forward);run(t,1.7);assert.equal(t.w.combo.step,4);assert.equal(t.w.combo.route,'short');assert.equal(t.w.ultimate.charge,60);assert.equal(t.w.ultimate.ready,false);
 const u=setup();enemy(u);u.w.request('charge',u.p,forward);run(u,.55);run(u,3.1);assert.equal(u.w.combo.step,0);assert.match(u.w.combo.failure,/시간/);
});
test('a point-blank off-center target stays in front for the final sweep and unlocks the ultimate',()=>{
 const s=setup(),e=enemy(s,.8,1.4,72);combo(s);assert.equal(e.alive,false);assert.equal(s.w.ultimate.ready,true);
});
test('the next skill may finish outside the 3-second start window; changing targets is allowed',()=>{
 const s=setup(),e=enemy(s);s.w.request('charge',s.p,forward);run(s,.55);run(s,2.8);e.alive=false;
 enemy(s,0,s.p.z+1.8);assert.ok(s.w.request('slam',s.p,forward).accepted);run(s,1.1);assert.equal(s.w.combo.step,2);
});
test('missed middle attacks, voluntary axe recovery and weapon changes break the chain',()=>{
 for(const operation of ['miss','walk','weapon']){const s=setup(),e=enemy(s);s.w.request('charge',s.p,forward);run(s,.55);
  if(operation==='miss') e.z=40;
  s.w.request('slam',s.p,forward);run(s,1.1);
  if(operation==='walk')run(s,.1,{x:1,z:0});if(operation==='weapon')s.h.equip('bow');
  assert.equal(s.w.combo.step,0);assert.equal(s.w.ultimate.ready,false);
 }
});
test('spin can be queued after the fourth impact, but never before unlocking',()=>{
 const s=setup();enemy(s);s.w.request('charge',s.p,forward);s.w.request('slam',s.p,forward);
 const finish=id=>{for(let i=0;s.w.active?.id===id&&i<240;i++)run(s,1/120);assert.notEqual(s.w.active?.id,id);};
 finish('charge');s.w.request('kick',s.p,forward);finish('slam');s.w.request('sweep',s.p,forward);finish('kick');
 assert.equal(s.w.active.id,'sweep');assert.equal(s.w.request('spin',s.p,forward).accepted,false);
 for(let i=0;!s.w.ultimate.ready&&i<200;i++)run(s,1/120);
 assert.ok(s.w.ultimate.ready);assert.ok(s.w.request('spin',s.p,forward).queued);finish('sweep');assert.equal(s.w.active.id,'spin');
});
test('spin hits all directions and each enemy only once per pulse; the third hit is critical and empowers',()=>{
 const s=setup(),front=enemy(s,0,2),back=enemy(s,0,-2),side=enemy(s,2,0);spin(s);run(s,.74);
 for(const e of [front,back,side])assert.equal(e.hp,484);assert.equal(s.w.active.stage,1);assert.equal(s.w.active.streak,2);
 run(s,.02);for(const e of [front,back,side])assert.equal(e.hp,468);assert.equal(s.w.active.stage,2);assert.equal(s.w.active.duration,2.75);assert.equal(s.w.active.criticalPulses,1);
});
test('empowered spin actually pulls distant enemies inward and stops outside the warrior',()=>{
 const s=setup();enemy(s,0,2);const outer=enemy(s,5,0);spin(s);run(s,.76);const before=outer.x;run(s,.3);assert.ok(outer.x<before-1.6);run(s,1);assert.ok(Math.hypot(outer.x,outer.z)>=1.099);
});
test('spin respects walls and height for both damage and suction',()=>{
 const wall={minX:-4,maxX:4,minZ:2.5,maxZ:2.6,bottom:0,top:4},s=setup([wall]);enemy(s,1,0);const blocked=enemy(s,0,3.5);spin(s);run(s,1.3);
 assert.equal(blocked.hp,500);assert.equal(blocked.z,3.5);assert.ok(!overlaps(blocked.x,blocked.z,wall,blocked.radius));
 const u=setup(),below=enemy(u,0,2);spin(u);u.p.y=5;u.w.update(.75,u.p);assert.equal(below.hp,500);
});
test('missing a pulse resets critical streak but an earned stage 2 remains',()=>{
 const s=setup(),e=enemy(s,0,2);spin(s);run(s,.51);assert.equal(s.w.active.streak,2);e.x=30;run(s,.25);assert.equal(s.w.active.streak,0);assert.equal(s.w.active.stage,1);e.x=0;run(s,.75);assert.equal(s.w.active.stage,2);
 e.x=30;run(s,.25);assert.equal(s.w.active.streak,0);assert.equal(s.w.active.stage,2);
});
test('off-balance and guaranteed critical share one 2x multiplier and one opening consumption',()=>{
 const s=setup(),e=enemy(s,0,2);spin(s);run(s,.51);s.h.applyOffBalance(e,4);run(s,.25);assert.equal(s.h.lastHit.damage,16);assert.equal(e.offBalance,0);assert.equal(s.h.criticalHits,1);assert.equal(s.w.active.duration,2.75);
});
test('critical and kill bonuses add time once as specified, capped at 4 seconds',()=>{
 const s=setup();for(let i=0;i<8;i++)enemy(s,Math.cos(i)*2,Math.sin(i)*2,24);spin(s);run(s,.76);
 assert.equal(s.h.kills.slime,8);assert.equal(s.w.active.duration,4);assert.equal(s.w.active.extended,1.5);run(s,3.3);assert.equal(s.w.active,null);assert.equal(s.w.ultimate.lastSpin.duration,4);
 const t=setup();enemy(t,0,2,8);spin(t);run(t,.26);assert.equal(t.w.active.duration,3);assert.equal(t.w.active.kills,1);
});
test('held movement during spin stays collision-safe and cannot create a new ultimate',()=>{
 const wall={minX:.8,maxX:.9,minZ:-5,maxZ:5,bottom:0,top:4},s=setup([wall]);spin(s);run(s,1,{x:1,z:0});assert.ok(s.p.x>.4&&s.p.x<.47);assert.equal(overlaps(s.p.x,s.p.z,wall),false);assert.equal(s.w.ultimate.ready,false);
});
test('reset, death and weapon switching end a spin without refund; death and reset clear stored charges',()=>{
 for(const mode of ['reset','death','weapon']){const s=setup();spin(s);run(s,.3);if(mode==='reset')s.h.restorePlayer();if(mode==='death')s.h.damagePlayer(100);if(mode==='weapon')s.h.equip('bow');assert.equal(s.w.active,null);assert.equal(s.w.ultimate.ready,false);}
 const t=setup();t.w.ultimate.ready=true;t.h.damagePlayer(100);assert.equal(t.w.ultimate.ready,false);t.h.restorePlayer();t.w.ultimate.ready=true;t.h.restorePlayer();assert.equal(t.w.ultimate.ready,false);
});
test('spin visuals rotate the whole body, distinguish suction, and leave the first-person camera stable',()=>{
 const s=setup();enemy(s,0,2);const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),avatar=createAvatar(scene),view=new WarriorView(scene,camera,avatar,s.w);spin(s);run(s,.3);view.update(0,false,s.p,true);
 assert.ok(view.spinVfx.visible);assert.ok(avatar.body.rotation.y>4);assert.ok(view.windLines.every(line=>!line.visible));run(s,.5);const q=camera.quaternion.clone();view.update(0,true,s.p,true);
 assert.ok(view.windLines.every(line=>line.visible));assert.ok(camera.quaternion.equals(q));assert.ok(view.firstRig.visible);s.w.cancel();view.update(0,false,s.p,true);assert.equal(view.spinVfx.visible,false);
});
console.log(`${count} ultimate checks passed.`);
