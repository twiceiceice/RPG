import assert from 'node:assert/strict';
import {Hunting} from '../dist/combat.js';
import {Movement} from '../dist/movement.js';
import {Village} from '../dist/village.js';
import {FieldHunt} from '../dist/field-hunt.js';
import {HUNTS} from '../dist/field-data.js';
import {PlayerFeedback} from '../dist/player-feedback.js';
import {XP_STEPS} from '../dist/progression.js';

let count=0;const test=(name,fn)=>{fn();console.log('PASS '+name);count++;};
function setup(colliders=[],storage=null){
  const h=new Hunting(colliders),p=new Movement(colliders),v=new Village(h,storage);
  Object.assign(p,{x:20,z:15,y:0});assert.ok(h.chooseClass('mage',p).accepted);
  Object.assign(p,{x:0,z:0,y:0});h.inSanctuary=false;
  const e={...h.entities.find(e=>e.kind==='slime'),id:'target',x:0,y:0,z:-6,hp:10000,maxHp:10000,raider:true,boss:true,ccImmune:true};
  h.entities=[e];return {h,p,v,m:h.mage,e};
}
function tick(s,seconds){for(let t=0;t<seconds-1e-7;t+=1/120)s.h.update(1/120,s.p);}
function shoot(s,id,target=s.e){const point={x:target.x,y:target.y+target.height*.5,z:target.z};return s.m.request(id,s.p,{x:point.x-s.p.x,y:0,z:point.z-s.p.z},point);}
function combo(s){assert.ok(shoot(s,'frost').accepted);tick(s,.45);assert.ok(shoot(s,'fireball').accepted);tick(s,1.3);}

test('frost then fireball produces a real critical hit, a saved ember and an instant moving finisher',()=>{
  const s=setup();combo(s);assert.equal(s.e.hp,10000-10-48);assert.equal(s.m.embers,1);assert.equal(s.m.charge,20);assert.equal(s.e.frostMark,0);
  s.p.vx=3;assert.ok(shoot(s,'flare').accepted);assert.equal(s.m.embers,0);tick(s,.4);assert.equal(s.e.hp,10000-10-48-34);assert.equal(s.m.tutorial,3);
  assert.ok(s.h.events.some(e=>e.type==='mage-shatter'));assert.equal(s.h.warrior.ultimate.charge,0);
});

test('walking, jumping and blink cancel unfinished fireballs without consuming cooldown or stored resources',()=>{
  for(const mode of ['walk','jump','blink']){
    const s=setup();s.m.embers=2;s.m.charge=50;assert.ok(shoot(s,'fireball').accepted);tick(s,.3);
    if(mode==='blink')assert.ok(s.m.request('blink',s.p,{x:1,z:0}).accepted);
    else {if(mode==='jump')s.p.jump();s.m.movement({x:mode==='walk'?1:0,z:0},s.p);}
    tick(s,.7);assert.equal(s.m.cast,null);assert.equal(s.m.cooldowns.fireball,0);assert.equal(s.e.hp,10000);assert.equal(s.m.embers,2);assert.equal(s.m.charge,50);
  }
});

test('missed, blocked, veiled and dodged projectiles never give marks, embers or charge',()=>{
  for(const mode of ['wall','range','veiled','dodge']){
    const wall={minX:-3,maxX:3,minZ:-3.2,maxZ:-3,bottom:0,top:4};const s=setup(mode==='wall'?[wall]:[]);
    if(mode==='range')s.e.z=-16;if(mode==='veiled')s.e.mirrorVeiled=true;if(mode==='dodge')s.e.dodge={elapsed:0};
    assert.ok(shoot(s,'frost').accepted);tick(s,1);assert.equal(s.e.hp,10000,mode);assert.equal(s.e.frostMark??0,0,mode);assert.equal(s.m.charge,0,mode);
    assert.ok(shoot(s,'fireball').accepted);tick(s,1.5);assert.equal(s.m.embers,0,mode);
  }
});

test('stored embers cap at two and survive time and movement; ultimate is earned once and cannot refill itself',()=>{
  const s=setup();for(let i=0;i<5;i++){combo(s);tick(s,2.5);}
  assert.equal(s.m.embers,2);assert.equal(s.m.charge,100);assert.equal(s.h.events.filter(e=>e.type==='mage-ready').length,1);
  s.p.vx=2;assert.ok(shoot(s,'surge').accepted);tick(s,.25);assert.ok(shoot(s,'fireball').accepted);assert.equal(s.m.cast,null);tick(s,.7);
  assert.equal(s.m.charge,0);assert.equal(s.m.embers,2);assert.equal(shoot(s,'surge').accepted,false);
  tick(s,8);assert.equal(shoot(s,'fireball').accepted,false,'ordinary fireball requires stopping again');assert.equal(s.m.embers,2);
});

test('ordinary enemies can be rooted and slowed, but both outdoor bosses keep their patterns and movement',()=>{
  const s=setup();Object.assign(s.e,{x:0,z:-3,raider:false,boss:false,ccImmune:false});assert.ok(shoot(s,'ring').accepted);const before={x:s.e.x,z:s.e.z};tick(s,.8);assert.ok(s.e.frozen>0);assert.equal(s.e.x,before.x);assert.equal(s.e.z,before.z);assert.ok(s.e.frostMark>0);
  for(const id of ['varkan','lysea']){
    const q=setup(),r=new FieldHunt(q.h,q.v);Object.assign(q.p,{x:20,z:15,y:0});r.select(id);r.acceptQuest(q.p);Object.assign(q.p,{...HUNTS[id].entry,y:0});assert.ok(r.start('field',q.p).accepted);
    q.e=r.boss.unit;Object.assign(q.p,{x:q.e.x+3,z:q.e.z});assert.ok(shoot(q,'ring').accepted);assert.ok(q.e.frostMark>0);assert.equal(q.e.frozen??0,0);assert.equal(q.e.slowed??0,0);assert.ok(q.e.alive);
  }
});

test('ring and projectiles respect solid cover, and ring cannot solve the mirror recognition mechanic',()=>{
  const wall={minX:-3,maxX:3,minZ:-2.2,maxZ:-2,bottom:0,top:4},s=setup([wall]);s.e.z=-3;assert.ok(shoot(s,'ring').accepted);assert.equal(s.e.hp,10000);assert.equal(s.e.frostMark??0,0);
  const q=setup(),r=new FieldHunt(q.h,q.v);Object.assign(q.p,{x:20,z:15,y:0});r.select('lysea');r.acceptQuest(q.p);Object.assign(q.p,{...HUNTS.lysea.entry,y:0});r.start('field',q.p);r.boss.begin('masquerade',q.p);
  const real=r.boss.projections.find(e=>e.realMirror),fake=r.boss.projections.find(e=>!e.realMirror);Object.assign(q.p,{x:real.x+1,z:real.z});assert.ok(shoot(q,'ring',real).accepted);assert.ok(real.alive);assert.equal(r.boss.stats.mirrorBreaks,0);
  tick(q,.45);Object.assign(q.p,{x:fake.x+3,z:fake.z});assert.ok(shoot(q,'frost',fake).accepted);tick(q,.4);assert.equal(r.boss.stats.falseMirrors,1);assert.equal(r.boss.stats.mirrorBreaks,0);
  tick(q,4);Object.assign(q.p,{x:real.x+3,z:real.z});assert.ok(shoot(q,'frost',real).accepted);tick(q,.4);assert.equal(r.boss.stats.mirrorBreaks,1);assert.equal(r.boss.unit.mirrorVeiled,false);
});

test('ice barrier reports absorption separately and only health overflow triggers the existing hurt feedback',()=>{
  const s=setup(),f=new PlayerFeedback(s.h.hp,s.h.maxHp);assert.ok(shoot(s,'barrier').accepted);
  assert.ok(s.h.damagePlayer(20,{source:'시험 공격'}));assert.equal(s.h.hp,100);assert.equal(s.m.shield,10);assert.equal(s.h.events.some(e=>e.type==='hurt'),false);
  s.h.invincible=0;s.h.damagePlayer(20,{source:'시험 공격'});const hurt=s.h.events.find(e=>e.type==='hurt');f.hit(hurt);assert.equal(f.notice.damage,10);assert.equal(s.h.hp,90);assert.equal(s.m.shield,0);
  assert.equal(shoot(s,'barrier').accepted,false);tick(s,18);assert.ok(shoot(s,'barrier').accepted);tick(s,8.1);assert.equal(s.m.shield,0);
});

test('blink stops before thin walls, cancels casting, preserves embers and grants only a brief dodge window',()=>{
  const wall={minX:1,maxX:1.05,minZ:-2,maxZ:2,bottom:0,top:4},s=setup([wall]);s.m.embers=2;shoot(s,'fireball');
  assert.ok(s.m.request('blink',s.p,{x:1,z:0}).accepted);assert.ok(s.p.x<=.66&&s.p.x>.5);assert.equal(s.m.cast,null);assert.equal(s.m.embers,2);
  assert.equal(s.h.damagePlayer(20),false);tick(s,.3);assert.equal(s.h.damagePlayer(20),true);assert.equal(s.h.hp,80);assert.equal(s.m.request('blink',s.p,{x:1,z:0}).accepted,false);
});

test('mage commands obey sanctuary, death, cooldown and class restrictions; reset clears combat resources',()=>{
  const s=setup();Object.assign(s.p,{x:20,z:15});for(const id of ['fireball','frost','ring','flare','surge','blink','barrier'])assert.equal(shoot(s,id).accepted,false,id);
  Object.assign(s.p,{x:0,z:0});s.m.embers=2;s.m.charge=100;s.h.hp=1;s.h.damagePlayer(100);assert.equal(s.m.embers,0);assert.equal(s.m.charge,0);assert.equal(shoot(s,'frost').accepted,false);
  s.h.restorePlayer();s.m.embers=1;s.m.charge=50;shoot(s,'frost');s.h.restorePlayer();assert.equal(s.m.projectiles.length,0);assert.equal(s.m.embers,0);assert.equal(s.m.charge,0);
  Object.assign(s.p,{x:20,z:15});assert.ok(s.h.chooseClass('warrior',s.p).accepted);assert.equal(s.h.weapon,'axe');assert.equal(shoot(s,'frost').accepted,false);assert.equal(s.h.equip('staff'),false);
});

test('legacy saves keep warrior talents and wealth; mage choice and its independent talents survive reload',()=>{
  let data=JSON.stringify({version:1,gold:177,wood:28,blocks:{stone:8},progression:{xp:60,ranks:{power:1}}});const storage={getItem:()=>data,setItem:(key,value)=>{data=value;}};
  const h=new Hunting(),v=new Village(h,storage),p=new Movement();Object.assign(p,{x:20,z:15});assert.equal(h.classId,'warrior');assert.equal(h.progression.rank('power'),1);
  h.hp=37;assert.ok(h.chooseClass('mage',p).accepted);assert.equal(h.hp,37);assert.equal(h.progression.rank('power'),0);assert.ok(h.progression.learn('flow').accepted);assert.equal(h.progression.bonuses.mageFrost,1);v.save();
  const copy=new Hunting(),v2=new Village(copy,storage);assert.equal(copy.classId,'mage');assert.equal(copy.weapon,'staff');assert.equal(copy.progression.rank('flow'),1);assert.equal(v2.gold,177);assert.equal(copy.forestry.wood,28);assert.equal(v2.blocks.stone,8);
  assert.ok(copy.chooseClass('warrior',p).accepted);assert.equal(copy.progression.rank('power'),1);assert.equal(copy.progression.rank('flow'),0);p.x=0;p.z=0;assert.equal(copy.chooseClass('mage',p).accepted,false);
});
test('mage talents strengthen actual spell hits, mark duration, barrier absorption and ultimate duration',()=>{
  const s=setup();s.h.progression.load({xp:XP_STEPS.reduce((n,v)=>n+v,0),mageRanks:{power:2,slam:2,execute:1,critical:1,flow:1,spin:1,vortex:1,tempest:1}});
  assert.equal(s.h.progression.points,0);assert.ok(shoot(s,'frost').accepted);tick(s,.4);assert.ok(s.e.frostMark>6);
  assert.ok(shoot(s,'fireball').accepted);tick(s,1.3);assert.equal(s.e.hp,10000-11-74);
  assert.ok(shoot(s,'flare').accepted);tick(s,.4);assert.equal(s.e.hp,10000-11-74-42);
  assert.ok(shoot(s,'barrier').accepted);assert.equal(s.m.shield,45);tick(s,.2);s.m.charge=100;assert.ok(shoot(s,'surge').accepted);assert.equal(s.m.surge,10);
});
console.log(`${count} mage checks passed`);
