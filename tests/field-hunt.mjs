import assert from 'node:assert/strict';
import {Hunting} from '../dist/combat.js';
import {Village} from '../dist/village.js';
import {Movement,terrainHeight} from '../dist/movement.js';
import {FieldHunt} from '../dist/field-hunt.js';
import {FIELD,STONES} from '../dist/field-data.js';
import {inHazard} from '../dist/raid-boss.js';
import {createVarkan,createFieldScenery,FieldHuntView} from '../dist/field-view.js';
import {createEnvironment} from '../dist/environment.js';
import * as THREE from '../dist/vendor/three.module.js';
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
function setup(storage=null,colliders=[]){const h=new Hunting(colliders),p=new Movement(colliders),v=new Village(h,storage),r=new FieldHunt(h,v);h.entities=[];h.equip('axe');Object.assign(p,{x:20,z:15,y:0,grounded:true});return {h,p,v,r};}
function locate(s,x,z){Object.assign(s.p,{x,z,y:terrainHeight(x,z),vx:0,vz:0,vy:0,grounded:true});}
function start(s,companion='none'){assert.ok(s.r.acceptQuest(s.p).accepted);locate(s,FIELD.entry.x,FIELD.entry.z);assert.ok(s.r.start('field',s.p,companion).accepted);s.u=s.r.boss.unit;s.r.boss.cooldown=999;return s;}
function tick(s,seconds,fn=()=>{}){for(let t=0;t<seconds-1e-7;t+=1/120){fn();s.h.update(1/120,s.p);s.r.update(1/120,s.p);}}
function memory(raw){let value=raw;return {getItem:()=>value,setItem:(key,v)=>{value=v;},get raw(){return value;}};}

test('a village quest and on-site start replace every raid wave and the beacon objective',()=>{
  const s=setup();assert.equal(s.r.start('field',s.p).accepted,false);assert.ok(s.r.acceptQuest(s.p).accepted);
  assert.equal(s.r.start('field',s.p).accepted,false);locate(s,FIELD.entry.x,FIELD.entry.z);assert.ok(s.r.start('field',s.p).accepted);
  assert.equal(s.r.phase,'fighting');assert.equal(s.r.enemies.length,1);assert.equal(s.r.allies.length,0);assert.equal(s.r.boss.unit.name,FIELD.bossName);
  s.r.beacon.alive=false;s.r.update(.1,s.p);assert.ok(s.r.active);assert.equal(s.r.start('assault',s.p).accepted,false);
});
test('old saves retain inventory, structures, talents and raid records while the new quest defaults safely',()=>{
  const saved=memory(JSON.stringify({version:1,gold:122,potions:3,wood:17,blocks:{stone:9},raidWins:{defense:4},progression:{xp:170,ranks:{power:1}},structures:[{id:'example'}]}));
  const s=setup(saved);assert.equal(s.v.gold,122);assert.equal(s.v.blocks.stone,9);assert.equal(s.v.raidWins.defense,4);assert.equal(s.h.forestry.wood,17);assert.equal(s.v.structures.length,1);assert.equal(s.v.progression.xp,170);assert.equal(s.v.huntQuest.accepted,false);
  assert.ok(s.r.acceptQuest(s.p).accepted);assert.equal(setup(saved).v.huntQuest.accepted,true);
});
test('corrupt and unknown save versions are preserved instead of overwritten on launch',()=>{
  for(const raw of ['{broken',JSON.stringify({version:99,gold:912})]){const saved=memory(raw),s=setup(saved);s.v.save();assert.equal(saved.raw,raw);assert.equal(s.v.storageAvailable,false);}
});
test('first report reward survives reload, can only be claimed in town once, repeats pay smaller rewards',()=>{
  const saved=memory(),s=start(setup(saved)),gold=s.v.gold;
  s.h.damageEntity(s.u,99999,0,0);s.r.update(.1,s.p);assert.equal(s.v.huntQuest.clears,1);assert.equal(s.v.gold,gold);assert.equal(s.v.progression.xp,150);
  assert.equal(s.r.claimReward(s.p).accepted,false);s.r.finish(true);assert.equal(s.v.huntQuest.clears,1);
  const loaded=setup(saved);assert.ok(loaded.r.claimReward(loaded.p).accepted);assert.equal(loaded.v.gold,gold+80);assert.equal(loaded.v.progression.xp,330);assert.equal(loaded.r.claimReward(loaded.p).accepted,false);
  locate(loaded,FIELD.entry.x,FIELD.entry.z);assert.ok(loaded.r.start('field',loaded.p).accepted);loaded.h.damageEntity(loaded.r.boss.unit,99999,0,0);loaded.r.update(.1,loaded.p);assert.equal(loaded.v.gold,gold+92);assert.equal(loaded.v.huntQuest.clears,2);assert.equal(loaded.v.blocks.stone,10);
});
test('cone waits for its warning, does modest damage, and is avoidable by stepping behind',()=>{
  for(const dodge of [false,true]){const s=start(setup());locate(s,FIELD.x+3,FIELD.z);s.r.boss.begin('sweep',s.p);tick(s,2.1);assert.equal(s.h.hp,100);
    if(dodge)locate(s,FIELD.x-3,FIELD.z);tick(s,.14);assert.equal(s.h.hp,dodge?100:84);}
});
test('lightning tracks then locks; leaving the locked mark avoids impact and its persistent pool',()=>{
  const s=start(setup());locate(s,-25,15);s.r.boss.begin('brand',s.p);tick(s,1);locate(s,-25,20);tick(s,1.55);const mark=s.r.boss.hazards[0];assert.equal(mark.locked,true);assert.equal(mark.z,20);
  locate(s,-30,20);tick(s,1.5);assert.equal(mark.z,20);assert.equal(s.h.hp,100);assert.ok(mark.fired);assert.ok(s.r.boss.hazards.length);
  s.r.boss.cooldown=999;locate(s,mark.x,mark.z);tick(s,1.1);assert.equal(s.h.hp,96);locate(s,-30,20);tick(s,8);assert.equal(s.r.boss.hazards.length,0);
});
test('inner-to-outer pulse leaves enough time to move into the cleared centre',()=>{
  const s=start(setup());locate(s,FIELD.x+5.5,FIELD.z);s.r.boss.begin('pulse',s.p);tick(s,2.3);assert.equal(s.h.hp,100);locate(s,FIELD.x+3,FIELD.z);tick(s,1.7);assert.equal(s.h.hp,100);
  const other=start(setup());locate(other,FIELD.x+5.5,FIELD.z);other.r.boss.begin('pulse',other.p);tick(other,4);assert.equal(other.h.hp,82);
});
test('lightning on the active rune breaks the stone and grants exactly eight seconds of +40% damage',()=>{
  const s=start(setup());s.r.boss.begin('resonance',s.p);const stone=s.r.boss.stones.find(x=>x.charged);locate(s,stone.x,stone.z);tick(s,4.9);locate(s,stone.x+3,stone.z);tick(s,1.45);
  assert.equal(s.r.boss.stats.stoneBreaks,1);assert.ok(s.u.exposed>7.9);assert.equal(s.r.boss.hazards.length,0);assert.equal(s.h.hp,100);assert.equal(s.h.damageEntity(s.u,100,0,0).damage,140);
  tick(s,8.1);assert.equal(s.u.exposed,0);assert.equal(s.h.damageEntity(s.u,100,0,0).damage,100);
});
test('kicks cannot replace the stone mechanic, missed stones leave a pool and are offered again',()=>{
  const s=start(setup());locate(s,FIELD.x,FIELD.z);s.r.boss.begin('resonance',s.p);assert.equal(s.r.boss.interrupt(s.u),false);s.h.damageEntity(s.u,1,0,0,{source:'kick'});assert.equal(s.u.exposed,0);
  tick(s,6.4);assert.equal(s.r.boss.stats.missedStones,1);assert.equal(s.r.enemies.length,1);assert.ok(s.r.boss.hazards.some(h=>h.burn));
  s.r.boss.patternIndex=3;s.r.boss.cooldown=0;tick(s,.01);assert.equal(s.r.boss.cast.id,'resonance');assert.ok(s.r.boss.stones.some(s=>s.charged));assert.equal(s.r.boss.hazards.length,1);
});
test('simultaneous hits share grace and combat health cannot passively regenerate',()=>{
  const s=start(setup());for(let i=0;i<2;i++)s.r.boss.addHazard({shape:'circle',x:s.p.x,z:s.p.z,radius:3,delay:1},'brand');tick(s,1.1);assert.equal(s.h.hp,84);assert.equal(s.r.boss.stats.playerHits,1);
  s.r.boss.cooldown=999;tick(s,9);assert.equal(s.h.hp,84);s.r.abort();s.h.update(1,s.p);assert.equal(s.h.hp,88);
});
test('thresholds offer overloads; final phase only pairs the pulse and brand',()=>{
  const s=start(setup());s.u.hp=s.u.maxHp*.64;s.r.boss.cooldown=0;tick(s,.01);assert.equal(s.r.boss.phase,2);assert.equal(s.r.boss.cast.id,'resonance');
  s.r.boss.hazards=[];s.r.boss.cast=null;s.u.hp=s.u.maxHp*.34;s.r.boss.cooldown=0;tick(s,.01);assert.equal(s.r.boss.phase,3);assert.equal(s.r.boss.cast.id,'resonance');
  s.r.boss.hazards=[];s.r.boss.begin('pulse',s.p);assert.deepEqual(new Set(s.r.boss.hazards.map(h=>h.pattern)),new Set(['pulse','brand']));
});
test('Nari has three limited heals, companion defeat does not fail the hunt, cleanup returns her home',()=>{
  const s=start(setup(),'nari'),n=s.r.allies[0];locate(s,n.x+1,n.z);
  for(let i=0;i<4;i++){s.h.hp=30;n.cooldown=0;s.r.heal(n,s.p,.01);assert.equal(s.h.hp,i<3?54:30);}assert.equal(n.healCharges,0);
  n.hp=0;n.alive=false;s.r.update(.01,s.p);assert.ok(s.r.active);s.r.abort();assert.equal(n.battle,false);assert.ok(n.alive);assert.equal(s.r.allies.length,0);assert.equal(s.r.boss.hazards.length,0);
});
test('leaving, player death and retry reset boss and hazards without granting rewards',()=>{
  for(const leave of [true,false]){const s=start(setup());s.r.boss.begin('brand',s.p);if(leave)locate(s,FIELD.x+26,FIELD.z);else s.h.hp=0;s.r.update(.01,s.p);
    assert.equal(s.r.active,false);assert.equal(s.v.huntQuest.clears,0);assert.equal(s.r.enemies.length,0);assert.equal(s.r.boss.hazards.length,0);
    s.h.restorePlayer();locate(s,FIELD.entry.x,FIELD.entry.z);assert.ok(s.r.start('field',s.p).accepted);assert.equal(s.r.boss.unit.hp,FIELD.health);}
});
test('actual outdoor terrain keeps stones and boss reachable; beast and moving floor geometry stay finite',()=>{
  const scene=new THREE.Scene(),env=createEnvironment(scene),s=start(setup(null,env.colliders)),scenery=createFieldScenery(scene),huntingView={proxies:[]},view=new FieldHuntView(scene,s.r,huntingView,scenery);
  for(const stone of STONES){assert.ok(s.r.nav.clear(stone.x,stone.z));assert.ok(s.r.nav.direct(FIELD,stone));}
  assert.ok(s.r.nav.clear(FIELD.x,FIELD.z,1.7));s.r.boss.begin('brand',s.p);view.update();locate(s,-23,21);tick(s,.5);view.update();
  const h=s.r.boss.hazards[0],shape=view.hazards.shapes.get(h.id);assert.equal(shape.root.position.x,h.x);assert.equal(shape.root.children.length,3);assert.ok(shape.bolt);
  for(const root of [createVarkan().root,scenery.root,shape.root])root.traverse(o=>{if(o.geometry)for(const n of o.geometry.attributes.position.array)assert.ok(Number.isFinite(n));});
  s.r.boss.hazards=[];s.r.boss.begin('pulse',s.p);view.update();for(const shape of view.hazards.shapes.values())assert.equal(shape.root.children.length,2,'no misleading green inner fill while the inner pulse is pending');
  assert.equal(inHazard({shape:'ring',x:0,z:0,inner:4.5,radius:10},{x:3,z:0}),false);
});
console.log(`${count} outdoor hunt checks passed`);
