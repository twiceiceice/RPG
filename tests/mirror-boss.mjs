import assert from 'node:assert/strict';
import {Hunting} from '../dist/combat.js';
import {Village} from '../dist/village.js';
import {Movement,terrainHeight} from '../dist/movement.js';
import {FieldHunt} from '../dist/field-hunt.js';
import {MIRROR_FIELD as FIELD,MIRROR_PILLARS as PILLARS,HUNTS} from '../dist/field-data.js';
import {mirrorPillarColliders} from '../dist/mirror-boss.js';
import {inHazard} from '../dist/raid-boss.js';
import {createEnvironment} from '../dist/environment.js';
import {createMirrorScenery,createLysea,MirrorHuntView} from '../dist/mirror-view.js';
import {createFieldScenery,FieldHuntView} from '../dist/field-view.js';
import * as THREE from '../dist/vendor/three.module.js';
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
function memory(raw){let value=raw;return {getItem:()=>value,setItem:(k,v)=>value=v};}
function setup(storage=null,colliders=mirrorPillarColliders()){
  const h=new Hunting(colliders),p=new Movement(colliders),v=new Village(h,storage),r=new FieldHunt(h,v);h.entities=[];h.equip('axe');Object.assign(p,{x:20,z:15,y:0});r.select('lysea');return {h,p,v,r};
}
function place(s,x,z){Object.assign(s.p,{x,z,y:terrainHeight(x,z),vx:0,vz:0,vy:0,grounded:true});}
function start(s,companion='none'){assert.ok(s.r.acceptQuest(s.p).accepted);place(s,FIELD.entry.x,FIELD.entry.z);assert.ok(s.r.start('field',s.p,companion).accepted);s.b=s.r.boss;s.u=s.b.unit;s.b.cooldown=999;return s;}
function tick(s,time,fn=()=>{}){for(let t=0;t<time-1e-8;t+=1/120){fn();s.h.update(1/120,s.p);s.r.update(1/120,s.p);}}

test('both hunts are immediately selectable, have independent quests and reject selection changes in combat',()=>{
  const s=setup();assert.equal(s.r.quest.accepted,false);assert.ok(s.r.acceptQuest(s.p).accepted);assert.equal(s.v.huntQuest.accepted,false);
  assert.ok(s.r.select('varkan').accepted);assert.ok(s.r.acceptQuest(s.p).accepted);assert.ok(s.r.select('lysea').accepted);
  place(s,HUNTS.varkan.entry.x,HUNTS.varkan.entry.z);assert.equal(s.r.start('field',s.p).accepted,false);place(s,FIELD.entry.x,FIELD.entry.z);assert.ok(s.r.start('field',s.p).accepted);
  assert.equal(s.r.select('varkan').accepted,false);assert.equal(s.r.selected,'lysea');assert.equal(s.r.select('missing').accepted,false);
});
test('legacy Varkan progress survives migration and Lysea rewards, records and claims persist independently',()=>{
  const saved=memory(JSON.stringify({version:1,gold:100,huntQuest:{accepted:true,clears:3,rewardClaimed:true,bestTime:110}})),s=start(setup(saved));
  s.h.damageEntity(s.u,99999,0,0);s.r.update(.1,s.p);assert.equal(s.v.huntQuest.clears,3);assert.equal(s.v.mirrorQuest.clears,1);assert.equal(s.v.gold,100);
  assert.equal(s.r.claimReward(s.p).accepted,false);place(s,20,15);assert.ok(s.r.claimReward(s.p).accepted);assert.equal(s.v.gold,190);assert.equal(s.v.blocks.roof,6);assert.equal(s.r.claimReward(s.p).accepted,false);
  const next=setup(saved);assert.ok(next.v.mirrorQuest.rewardClaimed);assert.equal(next.v.huntQuest.bestTime,110);place(next,FIELD.entry.x,FIELD.entry.z);assert.ok(next.r.start('field',next.p).accepted);next.h.damageEntity(next.r.boss.unit,99999,0,0);next.r.update(.1,next.p);assert.equal(next.v.gold,204);assert.equal(next.v.huntQuest.clears,3);
});
test('gaze gives its full warning, hits open space, and actual pillar line-of-sight prevents damage',()=>{
  for(const cover of [false,true]){const s=start(setup());const goal=s.b.coverGoal(s.p);place(s,cover?goal.x:FIELD.x+2,cover?goal.z:FIELD.z);s.b.begin('gaze',s.p);tick(s,4.4);assert.equal(s.h.hp,100);tick(s,.15);assert.equal(s.h.hp,cover?100:82);assert.equal(s.b.stats.coverSuccess,cover?1:0);}
  const s=start(setup());place(s,FIELD.x-5,FIELD.z);assert.equal(s.b.covered(s.p),false,'standing in front of the pillar is unsafe');place(s,FIELD.x-9.3,FIELD.z);assert.equal(s.b.covered(s.p),true);
});
test('the three curtain bands hit sequentially while the gaps stay safe',()=>{
  for(const safe of [false,true]){const s=start(setup());place(s,FIELD.x+2,FIELD.z+(safe?3:6));s.b.begin('curtain',s.p);tick(s,2);assert.equal(s.h.hp,100);tick(s,.15);assert.equal(s.h.hp,safe?100:86);}
});
test('beam warns first, rotates continuously, expires, and phase three adds one opposite beam',()=>{
  const s=start(setup());s.b.begin('waltz',s.p);const beam=s.b.hazards[0],startAngle=Math.atan2(beam.dx,beam.dz);tick(s,2.3);assert.equal(Math.atan2(beam.dx,beam.dz),startAngle);assert.equal(s.h.hp,100);
  tick(s,1);assert.ok(Math.atan2(beam.dx,beam.dz)>startAngle+.45);assert.ok(beam.fired);tick(s,4);assert.equal(s.b.hazards.length,0);
  s.b.phase=3;s.b.begin('waltz',s.p);assert.equal(s.b.hazards.length,2);assert.ok(Math.abs(s.b.hazards[0].dx+s.b.hazards[1].dx)<1e-9);
});
test('following the beam takes small repeated hits, with shared grace preventing same-frame overlap spikes',()=>{
  const s=start(setup());place(s,FIELD.x,FIELD.z+3);s.b.begin('waltz',s.p);
  const beam=s.b.hazards[0];tick(s,3.6,()=>{const a=beam.angle+Math.max(0,beam.age+1/120-beam.delay)*beam.rotationSpeed;place(s,FIELD.x+Math.sin(a)*3,FIELD.z+Math.cos(a)*3);});
  assert.ok(s.h.hp<=90&&s.h.hp>=70);assert.ok(s.b.stats.playerHits<=3);
});
test('mirror window has exactly one shadow-bearing target, shields the original and cannot be kicked away',()=>{
  const s=start(setup());s.b.begin('masquerade',s.p);assert.equal(s.b.projections.length,3);assert.equal(s.b.projections.filter(e=>e.realMirror).length,1);const hp=s.u.hp;
  assert.equal(s.h.damageEntity(s.u,9999,0,0).damage,0);assert.equal(s.u.hp,hp);assert.equal(s.b.interrupt(s.u),false);assert.ok(s.b.state().veiled);
});
test('wrong doubles give no XP, healing or kill credit; their shards can be avoided and solving remains possible',()=>{
  const s=start(setup());s.b.begin('masquerade',s.p);const fake=s.b.projections.find(e=>!e.realMirror),real=s.b.projections.find(e=>e.realMirror),xp=s.v.progression.xp;
  place(s,fake.x,fake.z);s.h.damageEntity(fake,99,1,0);assert.equal(s.v.progression.xp,xp);assert.equal(s.b.stats.falseMirrors,1);assert.equal(s.u.mirrorVeiled,true);
  place(s,FIELD.x,FIELD.z);tick(s,1.7);assert.equal(s.h.hp,100);assert.equal(s.h.damageEntity(real,99,1,0).killed,false);assert.equal(s.b.stats.mirrorBreaks,1);assert.equal(s.v.progression.xp,xp);assert.equal(s.r.enemies.length,1);
});
test('hidden original neither attracts auto attacks nor counts as a weapon or combo target',()=>{
  const s=start(setup());s.b.begin('masquerade',s.p);place(s,FIELD.x,FIELD.z);assert.ok(!s.h.targets().includes(s.u));assert.equal(s.h.autoAttack(s.p),false);assert.equal(s.h.autoMelee.targetId,null);
  assert.equal(s.h.warrior.spinTargets(s.p,3.2).length,0);assert.equal(s.h.damageEntity(s.u,100,1,0).damage,0);
});
test('a real weapon hit on the correct double reveals a seven-second +40% attack window',()=>{
  const s=start(setup());s.b.begin('masquerade',s.p);const real=s.b.projections.find(e=>e.realMirror);place(s,real.x-1.3,real.z);
  assert.ok(s.h.attack(s.p,{x:1,z:0}));tick(s,.8);assert.equal(s.b.stats.mirrorBreaks,1);assert.equal(s.u.mirrorVeiled,false);assert.ok(s.u.exposed>6);assert.equal(s.h.damageEntity(s.u,100,0,1).damage,140);
  tick(s,7.1);assert.equal(s.u.exposed,0);assert.equal(s.h.damageEntity(s.u,100,0,1).damage,100);
});
test('missed recognition removes every double, warns before punishment and offers another mirror cycle',()=>{
  const s=start(setup());s.b.begin('masquerade',s.p);const first=s.b.projections.find(e=>e.realMirror).id;tick(s,16.1);
  assert.equal(s.b.stats.missedMirrors,1);assert.equal(s.b.projections.length,0);assert.equal(s.u.mirrorVeiled,false);assert.equal(s.b.state().cast.id,'gaze');assert.equal(s.h.hp,100);
  s.b.cooldown=999;const goal=s.b.coverGoal(s.p);place(s,goal.x,goal.z);tick(s,3.6);assert.equal(s.h.hp,100);assert.ok(s.b.stats.coverSuccess>0);
  s.b.begin('masquerade',s.p);assert.notEqual(s.b.projections.find(e=>e.realMirror).id,first);assert.equal(s.b.projections.filter(e=>e.realMirror).length,1);
});
test('thresholds schedule recognition windows without spawning ordinary reinforcements',()=>{
  const s=start(setup());s.u.hp=s.u.maxHp*.64;s.b.cooldown=0;tick(s,.01);assert.equal(s.b.phase,2);assert.equal(s.b.cast.id,'masquerade');assert.equal(s.r.enemies.length,4);
  const real=s.b.projections.find(e=>e.realMirror);s.h.damageEntity(real,1,0,1);s.u.hp=s.u.maxHp*.34;tick(s,7.9);assert.equal(s.b.phase,3);assert.equal(s.b.cast.id,'masquerade');assert.equal(s.r.enemies.length,4);
});
test('Nari seeks real cover, cannot solve the puzzle, and a dead companion does not fail the hunt',()=>{
  const s=start(setup(),'nari'),n=s.r.allies[0];s.b.begin('gaze',s.p);place(s,FIELD.x+2,FIELD.z);tick(s,4.4);assert.ok(s.b.covered(n));tick(s,.3);assert.equal(n.hp,n.maxHp);
  s.b.begin('masquerade',s.p);tick(s,1);assert.equal(s.b.stats.mirrorBreaks,0);n.hp=0;n.alive=false;tick(s,.1);assert.ok(s.r.active);
});
test('retreat, death and boss selection clear doubles, beams and invulnerability while preserving Varkan',()=>{
  for(const death of [false,true]){const s=start(setup(),'nari');s.b.begin('masquerade',s.p);if(death){s.h.hp=0;s.r.update(.01,s.p);}else s.r.abort();assert.equal(s.b.projections.length,0);assert.equal(s.b.hazards.length,0);assert.ok(!s.u.mirrorVeiled);assert.equal(s.h.entities.filter(e=>e.raider).length,0);assert.equal(s.v.mirrorQuest.clears,0);assert.ok(s.r.select('varkan').accepted);assert.equal(s.r.boss,s.r.bosses.varkan);assert.equal(s.r.boss.unit,null);}
});
test('arena is flat and clear, pillars stop movement, and navigation finds paths in the new region',()=>{
  const scene=new THREE.Scene(),env=createEnvironment(scene);createMirrorScenery(scene,env);const s=start(setup(null,env.colliders));
  for(const p of [FIELD,FIELD.entry,...PILLARS])assert.ok(terrainHeight(p.x,p.z)===0);
  for(const p of PILLARS){assert.equal(s.r.nav.clear(p.x,p.z),false);const start={x:p.x-2,z:p.z},end={x:p.x+2,z:p.z};assert.ok(s.r.nav.path(start,end).length>0);const cell=s.r.nav.cell(start);assert.ok(s.r.nav.point(cell).z<-10);}
  s.b.begin('masquerade',s.p);for(const p of s.b.projections)assert.ok(s.r.nav.clear(p.x,p.z,p.radius));
});
test('both boss visuals coexist, only the true double casts a solid clue, and rotating VFX match hit geometry',()=>{
  const scene=new THREE.Scene(),env={colliders:mirrorPillarColliders(),cameraSurfaces:[]},scenery=createMirrorScenery(scene,{colliders:[],cameraSurfaces:[]}),s=start(setup(null,env.colliders)),hv={proxies:[]},view=new MirrorHuntView(scene,s.r,hv,scenery),varkan=new FieldHuntView(scene,s.r,hv,createFieldScenery(scene));
  s.b.begin('masquerade',s.p);view.update(.1);varkan.update(.1);assert.equal(view.look.root.visible,false);assert.ok(varkan.look.root.visible);assert.equal(view.projections.filter(p=>p.shadow.visible).length,1);
  s.h.damageEntity(s.b.projections.find(e=>e.realMirror),2,1,0);view.update();assert.equal(view.look.root.visible,true);assert.equal(view.projections.filter(p=>p.look.root.visible).length,0);
  s.b.begin('waltz',s.p);view.update();const h=s.b.hazards[0];tick(s,3);view.update();const shape=view.hazards.shapes.get(h.id);shape.root.updateMatrixWorld(true);
  const p=shape.root.children[0].geometry.attributes.position;let checks=0;
  for(let i=0;i<p.count;i+=23){const world=new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(shape.root.matrixWorld);assert.ok(inHazard(h,{x:world.x,z:world.z},.001));checks++;}assert.ok(checks>5);
  for(const root of [createLysea().root,scene])root.traverse(o=>{if(o.geometry)for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));});
});
console.log(`${count} mirror boss checks passed`);
