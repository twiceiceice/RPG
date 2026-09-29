import assert from 'node:assert/strict';
import {Hunting} from '../dist/combat.js';
import {Movement} from '../dist/movement.js';
import {Village} from '../dist/village.js';
import {Raids} from '../dist/raids.js';
import {WARRIOR_SKILLS,warriorMotionTime} from '../dist/warrior.js';
import {BATTLE} from '../dist/battle-rules.js';
import {KICK_POWER} from '../dist/kick-power.js';
import * as THREE from '../dist/vendor/three.module.js';
import {createAvatar} from '../dist/environment.js';
import {WarriorView} from '../dist/warrior-view.js';
const forward={x:0,z:1},dt=1/120;
let count=0,failed=0;
function test(name,fn){try{fn();count++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name,e);}}
function setup(walls=[]){const h=new Hunting(walls),p=new Movement(walls);h.equip('axe');h.entities=[];Object.assign(p,{x:0,y:0,z:0});return {h,p,w:h.warrior};}
function enemy(s,x=0,z=5,immune=false){const e=new Hunting().entities.find(e=>e.kind==='slime');Object.assign(e,{id:'target-'+s.h.entities.length,x,y:0,z,homeX:x,homeZ:z,hp:5000,maxHp:5000,stagger:100,ccImmune:immune});s.h.entities.push(e);return e;}
function tick(s,n=1,input={x:0,z:0}){for(let i=0;i<n;i++){s.w.movement(input,s.p);s.h.tactics.movement(input);s.p.update(dt,input);s.h.update(dt,s.p);}}
function until(s,fn,limit=600){for(let i=0;i<limit;i++){if(fn())return;tick(s);}assert.fail('condition timed out: '+JSON.stringify(s.w.state()));}
function request(s,id,dir=forward){const result=s.w.request(id,s.p,dir);assert.ok(result.accepted,JSON.stringify(result));return result;}
function slamCombo(s){enemy(s);request(s,'charge');request(s,'slam');until(s,()=>s.w.active?.id==='slam'&&s.w.combo.step===2);}

test('four queued moves connect against all kick powers within 3.25 seconds and bank one ultimate',()=>{
  assert.ok(Math.abs(WARRIOR_SKILLS.slice(0,4).reduce((n,a)=>n+a.duration,0)-3.2)<1e-9);
  for(const power of ['light','medium','strong']){
    const s=setup(),e=enemy(s);s.w.kickPower.roll=()=>KICK_POWER[power];
    request(s,'charge');request(s,'slam');let frames=0;
    while(s.w.active&&frames<450){const next={slam:'kick',kick:'sweep'}[s.w.active.id];if(next&&!s.w.queued)request(s,next);tick(s);frames++;}
    assert.ok(s.w.ultimate.ready,power+': '+JSON.stringify(s.w.state()));assert.ok(frames*dt<3.25);assert.equal(s.w.combo.step,4);assert.ok(e.hp<5000);
    assert.equal(s.w.executions.sweep,1);assert.equal(s.p.grounded,true);
  }
});
test('dodge preserves landed steps, queues a retargeted held-axe kick, then sweep and spin',()=>{
  const s=setup();slamCombo(s);const before=s.h.entities[0].hp;
  assert.ok(s.h.tactics.request('evade',s.p,{x:1,z:0}).accepted);assert.equal(s.w.combo.step,2);assert.equal(s.w.planted,null);assert.ok(s.w.carried);
  const time=s.w.combo.remaining;assert.ok(request(s,'kick').queued);tick(s,20);assert.equal(s.w.combo.remaining,time);assert.equal(s.h.entities[0].hp,before);assert.equal(s.w.active,null);
  s.w.setAim({x:1,z:0});enemy(s,5.7,s.p.z,true);until(s,()=>s.w.active?.id==='kick');assert.equal(s.w.active.carriedAxe,true);assert.equal(s.w.active.dx,1);assert.equal(s.w.active.dz,0);
  request(s,'sweep',{x:1,z:0});until(s,()=>s.w.ultimate.ready);assert.equal(s.w.executions.kick,1);assert.equal(s.w.executions.sweep,1);assert.ok(request(s,'spin',{x:1,z:0}).queued);until(s,()=>s.w.active?.id==='spin');
});
test('dodge at the end of the window grants two seconds, but expires before another dodge is ready',()=>{
  const s=setup();enemy(s);request(s,'charge');until(s,()=>!s.w.active);tick(s,330);assert.ok(s.w.combo.remaining<.3);
  s.h.tactics.request('evade',s.p,{x:1,z:0});const before=s.w.combo.remaining;tick(s,35);assert.equal(s.w.combo.remaining,before);until(s,()=>!s.h.tactics.dodge);assert.ok(s.w.combo.remaining>=1.98);
  tick(s,245);assert.equal(s.w.combo.step,0);assert.ok(s.h.tactics.cooldowns.evade>1);assert.match(s.w.combo.failure,/시간/);
});
test('pre-impact dodge neither damages nor grants a step, allows the cancelled move to be retried',()=>{
  const s=setup();enemy(s);request(s,'charge');until(s,()=>!s.w.active);request(s,'slam');tick(s,10);const hp=s.h.entities[0].hp;
  s.h.tactics.request('evade',s.p,{x:1,z:0});assert.equal(s.w.combo.step,1);assert.equal(s.w.carried,null);assert.equal(s.w.cooldowns.slam,0);assert.equal(s.h.entities[0].hp,hp);
  assert.equal(s.w.request('kick',s.p,forward).accepted,false);assert.ok(request(s,'slam').queued);until(s,()=>s.w.active?.id==='slam');assert.equal(s.w.combo.step,1);
});
test('dodging after a missed impact cannot hide the miss or retain combo credit',()=>{
  const s=setup(),e=enemy(s);request(s,'charge');until(s,()=>!s.w.active);e.x=40;request(s,'slam');until(s,()=>s.w.active.hit);
  s.h.tactics.request('evade',s.p,{x:1,z:0});assert.equal(s.w.combo.step,0);assert.match(s.w.combo.failure,/빗나/);assert.ok(s.w.cooldowns.slam>0);
  const k=setup();slamCombo(k);until(k,()=>!k.w.active);k.h.entities[0].x=40;request(k,'kick');tick(k,95);assert.ok(k.p.grounded);assert.equal(k.w.active.id,'kick');
  k.h.tactics.request('evade',k.p,{x:1,z:0});assert.equal(k.w.combo.step,0);assert.match(k.w.combo.failure,/빗나/);
});
test('brief real raid stagger preserves the chain, heavy stagger clears it and its buffer',()=>{
  for(const duration of [.3,.8]){const s=setup();slamCombo(s);const v=new Village(s.h),r=new Raids(s.h,v);r.mode='assault';r.phase='fighting';s.h.invincible=0;
    r.hitAlly(r.playerTarget(s.p),10,{stagger:duration});assert.equal(s.w.active,null);assert.equal(s.w.combo.step,duration<.65?2:0);assert.equal(!!s.w.carried,duration<.65);
    if(duration<.65){assert.ok(request(s,'kick').queued);const time=s.w.combo.remaining;tick(s,20);assert.equal(s.w.combo.remaining,time);}else assert.equal(s.w.queued,null);
  }
});
test('a queued follow-up survives a brief airborne landing gap but cannot execute indefinitely later',()=>{
  for(const height of [.12,20]){const s=setup();slamCombo(s);request(s,'kick');Object.assign(s.p,{grounded:false,y:height,vy:-1});s.w.update(.8,s.p);assert.equal(s.w.active,null);assert.equal(s.w.queued.id,'kick');
    if(height<1){until(s,()=>s.w.active?.id==='kick');assert.equal(s.w.executions.kick,1);}else{tick(s,60);assert.equal(s.w.queued,null);assert.equal(s.w.executions.kick,0);}}
});
test('death, weapon change and reset clear continuation and queued inputs',()=>{
  for(const action of [s=>s.h.equip('bow'),s=>{s.h.hp=0;s.w.update(dt,s.p);},s=>s.h.restorePlayer()]){const s=setup();slamCombo(s);s.h.tactics.request('evade',s.p,{x:1,z:0});request(s,'kick');action(s);assert.equal(s.w.carried,null);assert.equal(s.w.queued,null);assert.equal(s.w.combo.step,0);}
});
test('ordinary movement after a dodge can reposition, while recovering a planted axe by walking still breaks combo',()=>{
  for(const dodge of [true,false]){const s=setup();slamCombo(s);until(s,()=>!s.w.active);if(dodge){s.h.tactics.request('evade',s.p,{x:1,z:0});until(s,()=>!s.h.tactics.dodge);}const x=s.p.x;tick(s,20,{x:1,z:0});assert.ok(s.p.x>x);assert.equal(s.w.combo.step,dodge?2:0);}
});
test('charge range, slam damage, basic cadence and NPC warning time stay unchanged',()=>{
  const s=setup();request(s,'charge');tick(s,70);assert.ok(Math.abs(s.p.z-9.9)<1e-8);
  const t=setup(),e=enemy(t,0,2);request(t,'slam');tick(t,100);assert.equal(e.hp,4961);assert.equal(BATTLE.slam.impact,.64);assert.equal(BATTLE.sweep.duration,1.65);
  const u=setup();enemy(u,0,2,true);for(let i=0;i<240;i++){u.h.autoAttack(u.p);tick(u);}assert.equal(u.h.autoMelee.attacks,1);u.h.autoAttack(u.p);assert.equal(u.h.autoMelee.attacks,2);
});
test('held-axe follow-up and normal animation poses stay finite with synchronized sweep VFX in both views',()=>{
  for(const carried of [false,true]){const s=setup(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),avatar=createAvatar(scene),view=new WarriorView(scene,camera,avatar,s.w);slamCombo(s);until(s,()=>!s.w.active);
    if(carried){s.h.tactics.request('evade',s.p,{x:1,z:0});until(s,()=>!s.h.tactics.dodge);}request(s,'kick');request(s,'sweep');let sawSweep=false;
    for(let i=0;i<280&&s.w.active;i++){tick(s);for(const first of [false,true]){view.update(dt,first,s.p,false);for(const obj of [view.axe,view.firstAxe,...view.arms.flatMap(a=>[a.hand,a.fore,a.upper])])assert.ok([...obj.position.toArray(),...obj.quaternion.toArray()].every(Number.isFinite));}if(s.w.active?.id==='sweep'&&warriorMotionTime(s.w.active)>1&&warriorMotionTime(s.w.active)<1.2){sawSweep=true;assert.ok(view.sweepVfx.visible);}}
    assert.ok(sawSweep);assert.equal(s.w.active,null);
  }
});
console.log(`${count} combat flow checks passed; ${failed} failed`);if(failed)process.exitCode=1;
