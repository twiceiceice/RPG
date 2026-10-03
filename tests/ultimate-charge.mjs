import assert from 'node:assert/strict';
import {Hunting} from '../dist/combat.js';
import {Movement} from '../dist/movement.js';
import {Village} from '../dist/village.js';

const forward={x:0,z:1},dt=1/120;
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
function setup(walls=[],trees=[]){
  const h=new Hunting(walls,trees),p=new Movement(walls);h.entities=[];h.equip('axe');
  Object.assign(p,{x:0,y:0,z:0});return {h,p,w:h.warrior};
}
function enemy(s,x=0,z=2,hp=5000){
  const e=new Hunting().entities.find(e=>e.kind==='slime');
  Object.assign(e,{id:`target-${s.h.entities.length}`,x,y:0,z,homeX:x,homeZ:z,hp,maxHp:hp,stagger:10000,ccImmune:true});
  s.h.entities.push(e);return e;
}
function tick(s,n=1,input={x:0,z:0}){
  for(let i=0;i<n;i++){s.w.movement(input,s.p);s.h.tactics.movement(input);s.p.update(dt,input);s.h.update(dt,s.p);}
}
function until(s,condition,limit=900){
  for(let i=0;i<limit;i++){if(condition())return;tick(s);}
  assert.fail('condition timed out: '+JSON.stringify(s.w.state()));
}
function request(s,id,direction=forward){const r=s.w.request(id,s.p,direction);assert.ok(r.accepted,JSON.stringify(r));return r;}
function finish(s){until(s,()=>!s.w.active&&!s.w.queued&&!s.h.tactics.busy);}
function short(s){request(s,'slam');request(s,'sweep');finish(s);}
function long(s){request(s,'slam');request(s,'kick');until(s,()=>s.w.active?.id==='kick');request(s,'sweep');finish(s);}
function resetCooldownWait(s){until(s,()=>s.w.cooldowns.slam===0&&s.w.cooldowns.sweep===0);}

test('two short routes without charge or kick bank one ultimate, which is consumed only once',()=>{
  const s=setup();enemy(s);short(s);
  assert.equal(s.w.ultimate.charge,50);assert.equal(s.w.ultimate.ready,false);
  assert.equal(s.w.combo.route,'short');assert.equal(s.w.request('spin',s.p,forward).accepted,false);
  resetCooldownWait(s);short(s);
  assert.equal(s.w.ultimate.charge,100);assert.equal(s.w.ultimate.ready,true);
  assert.equal(s.w.executions.charge,0);assert.equal(s.w.executions.kick,0);
  assert.equal(s.h.events.filter(e=>e.type==='ultimate-ready').length,1);
  request(s,'spin');assert.equal(s.w.ultimate.charge,0);finish(s);
  assert.equal(s.w.ultimate.charge,0);assert.equal(s.w.ultimate.ready,false);
  assert.equal(s.w.request('spin',s.p,forward).accepted,false);
});

test('a long route starts at slam and earns 100 without a mandatory approach',()=>{
  const s=setup();enemy(s);long(s);
  assert.equal(s.w.ultimate.charge,100);assert.equal(s.w.combo.route,'long');assert.ok(s.w.ultimate.ready);
  assert.equal(s.w.executions.charge,0);
  assert.deepEqual(s.h.events.filter(e=>e.type==='ultimate-charge').map(e=>e.amount),[20,20,60]);
});

test('optional charge adds ten and earned charge never overflows while another combo is played',()=>{
  const s=setup();enemy(s,0,5);request(s,'charge');finish(s);assert.equal(s.w.ultimate.charge,10);
  long(s);assert.equal(s.w.ultimate.charge,100);
  const gains=s.h.events.filter(e=>e.type==='ultimate-charge').length;
  resetCooldownWait(s);request(s,'slam');until(s,()=>s.w.combo.step===2);
  assert.deepEqual(s.w.state().combo.nextSkills,['kick','sweep']);assert.ok(s.w.state().ultimate.ready);
  request(s,'sweep');finish(s);
  assert.equal(s.w.ultimate.charge,100);assert.equal(s.w.ultimate.ready,true);
  assert.equal(s.h.events.filter(e=>e.type==='ultimate-charge').length,gains);
  assert.equal(s.h.events.filter(e=>e.type==='ultimate-ready').length,1);
});

test('misses, timeouts, walking, weapon swaps and heavy stagger keep previously earned charge',()=>{
  for(const operation of ['miss','timeout','walk','weapon','heavy']){
    const s=setup(),e=enemy(s);request(s,'slam');finish(s);assert.equal(s.w.ultimate.charge,20);
    if(operation==='miss'){e.x=30;request(s,'sweep');finish(s);}
    if(operation==='timeout')tick(s,400);
    if(operation==='walk')tick(s,1,{x:1,z:0});
    if(operation==='weapon'){s.h.equip('bow');tick(s,3);s.h.equip('axe');}
    if(operation==='heavy')s.w.interrupt(true);
    assert.equal(s.w.combo.step,0,operation);assert.equal(s.w.ultimate.charge,20,operation);
    assert.equal(s.w.ultimate.ready,false,operation);
  }
});

test('a missed kick invalidates the long finish bonus but the later sweep still charges on hit',()=>{
  const s=setup(),e=enemy(s);request(s,'slam');finish(s);e.x=30;
  request(s,'kick');finish(s);assert.equal(s.w.ultimate.charge,20);assert.equal(s.w.combo.step,0);
  Object.assign(e,{x:s.p.x,z:s.p.z+2});request(s,'sweep');finish(s);
  assert.equal(s.w.ultimate.charge,40);assert.equal(s.w.combo.route,null);
});

test('multiple targets and repeated kick frames award only one gain per cast',()=>{
  const s=setup();for(const x of [-.5,0,.5])enemy(s,x,2);long(s);
  assert.ok(s.h.entities.every(e=>e.hp<e.maxHp));
  assert.equal(s.w.ultimate.charge,100);
  assert.deepEqual(s.h.events.filter(e=>e.type==='ultimate-charge').map(e=>e.amount),[20,20,60]);
});

test('dodge preserves a queued short sweep after slam and retargets it on landing',()=>{
  const s=setup();enemy(s);request(s,'slam');until(s,()=>s.w.combo.step===2);
  assert.ok(request(s,'sweep').queued);
  assert.ok(s.h.tactics.request('evade',s.p,{x:1,z:0}).accepted);
  assert.equal(s.w.queued.id,'sweep');assert.equal(s.w.ultimate.charge,20);
  s.w.setAim({x:1,z:0});const next=enemy(s,5.7,0);
  until(s,()=>s.w.active?.id==='sweep');assert.equal(s.w.active.dx,1);assert.equal(s.w.active.carriedAxe,true);
  finish(s);assert.ok(next.hp<next.maxHp);assert.equal(s.w.combo.route,'short');assert.equal(s.w.ultimate.charge,50);
});

test('cancelling before impact grants nothing, then retrying a landed slam grants only once',()=>{
  const s=setup();enemy(s);request(s,'slam');tick(s,5);s.w.interrupt();
  assert.equal(s.w.ultimate.charge,0);assert.equal(s.w.cooldowns.slam,0);
  request(s,'slam');until(s,()=>s.w.combo.step===2);s.w.interrupt();
  assert.equal(s.w.ultimate.charge,20);assert.deepEqual(s.w.state().combo.nextSkills,['kick','sweep']);
  request(s,'sweep');finish(s);assert.equal(s.w.ultimate.charge,50);
});

test('no charge is awarded for evaded, veiled, zero-damage or obstructed hits',()=>{
  for(const kind of ['evaded','veiled','zero','wall']){
    const wall={minX:-4,maxX:4,minZ:.9,maxZ:1,bottom:0,top:4};
    const s=setup(kind==='wall'?[wall]:[]),e=enemy(s);
    if(kind==='evaded')e.dodge={elapsed:0};
    if(kind==='veiled')e.mirrorVeiled=true;
    if(kind==='zero')e.mirrorProjection=true;
    request(s,'slam');finish(s);assert.equal(s.w.ultimate.charge,0,kind);assert.equal(e.hp,e.maxHp,kind);
  }
});

test('lethal finishes and forestry still give charge through actual damage',()=>{
  const s=setup(),e=enemy(s,0,2,50);short(s);assert.equal(e.alive,false);assert.equal(s.w.ultimate.charge,50);
  const t=setup([],[{id:'tree',x:0,y:0,z:2,scale:1,collider:{active:true}}]);short(t);
  assert.ok(t.h.forestry.trees[0].hp<160);assert.equal(t.w.ultimate.charge,50);
});

test('completed branch feedback expires quietly and basic attacks resume without charging',()=>{
  const s=setup();enemy(s);short(s);
  s.h.autoAttack(s.p);assert.equal(s.w.active?.id,'slash');finish(s);
  assert.equal(s.w.ultimate.charge,50);tick(s,400);
  assert.equal(s.w.combo.step,0);assert.equal(s.w.combo.failure,null);
  assert.equal(s.h.events.filter(e=>e.type==='combo-break').length,0);
});

test('sanctuary cleanup and ordinary damage retain partial charge; death, recovery and a new session clear it',()=>{
  for(const reset of ['death','recovery','session']){
    const s=setup();enemy(s);short(s);const v=new Village(s.h);
    s.h.damagePlayer(10);assert.equal(s.w.ultimate.charge,50);
    Object.assign(s.p,{x:20,y:0,z:15});assert.ok(v.isSafe(s.p));tick(s,1);
    assert.equal(s.w.ultimate.charge,50);assert.equal(s.w.combo.step,0);
    if(reset==='death'){Object.assign(s.p,{x:0,z:0});tick(s,100);s.h.damagePlayer(1000);assert.equal(s.h.hp,0);}
    if(reset==='recovery')s.h.restorePlayer();
    const result=reset==='session'?new Hunting().warrior:s.w;
    assert.equal(result.ultimate.charge,0,reset);assert.equal(result.ultimate.ready,false,reset);
  }
});
console.log(`${count} ultimate charge checks passed`);
