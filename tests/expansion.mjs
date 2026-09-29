import assert from 'node:assert/strict';
import {Hunting} from '../dist/combat.js';
import {Movement,terrainHeight,WORLD_RADIUS} from '../dist/movement.js';
import {Village} from '../dist/village.js';
import {Raids} from '../dist/raids.js';
import {Building} from '../dist/building.js';
import {VILLAGE,BUILD_PLOTS,RESIDENTS} from '../dist/village-data.js';
import {XP_STEPS,TALENTS} from '../dist/progression.js';
import * as THREE from '../dist/vendor/three.module.js';
import {createEnvironment} from '../dist/environment.js';
import {createVillageScenery} from '../dist/village-view.js';
import {createRaidScenery} from '../dist/raid-view.js';
import {GameAudio} from '../dist/audio.js';
let count=0;const test=(name,run)=>{run();console.log('PASS '+name);count++;};
const storage=(initial={})=>{const data=new Map(Object.entries(initial));return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
function setup(save=storage(),colliders=[]){const h=new Hunting(colliders),v=new Village(h,save),p=new Movement(colliders),r=new Raids(h,v),b=new Building(v,colliders);Object.assign(p,{x:45,z:5,y:0});return {h,v,p,r,b,save,progression:v.progression};}
const maxXp=XP_STEPS.reduce((n,v)=>n+v,0);
test('old save migrates without losing resources and earns exactly ten talent points',()=>{
  const s=setup(storage({'windfield-village-v1':JSON.stringify({version:1,gold:177,wood:28,handleLevel:2,potions:3,armorLevel:1,blocks:{timber:14,stone:8,roof:5},raidWins:{defense:2,assault:1}})}));
  assert.equal(s.v.gold,177);assert.equal(s.h.forestry.wood,28);assert.equal(s.progression.points,1);assert.equal(s.v.blocks.timber,14);
  for(let i=0;i<5;i++)s.progression.add('rabbit');assert.equal(s.progression.level,2);assert.equal(s.progression.points,2);
  for(let i=0;i<100;i++)s.progression.add('assault');assert.equal(s.progression.level,10);assert.equal(s.progression.xp,maxXp);assert.equal(s.progression.points,10);assert.equal(s.progression.add('slime'),0);
  const reloaded=setup(s.save);assert.equal(reloaded.progression.level,10);assert.equal(reloaded.v.gold,177);assert.equal(reloaded.v.raidWins.defense,2);
});
test('talent prerequisites, level gates, point limits, refunds and corrupt saves',()=>{
  const s=setup(),p=s.progression;assert.equal(p.learn('slam').accepted,false);assert.ok(p.learn('power').accepted);assert.equal(p.learn('power').accepted,false);
  p.load({xp:maxXp,ranks:{}});for(const t of ['flow','flow','spin','spin','vortex','tempest'])assert.ok(p.learn(t).accepted,t);assert.equal(p.points,4);
  s.v.save();assert.equal(setup(s.save).progression.rank('tempest'),1);p.reset();assert.equal(p.points,10);
  p.load({xp:0,ranks:Object.fromEntries(TALENTS.map(t=>[t.id,99]))});assert.ok(p.spent<=1);assert.equal(p.rank('tempest'),0);p.load({xp:NaN,ranks:{power:-2}});assert.equal(p.points,1);
});
test('damage, execution and critical talents affect players but never resident damage',()=>{
  const s=setup();s.progression.load({xp:maxXp,ranks:{power:2,slam:2,execute:1,critical:1}});
  const target=()=>({id:'dummy',kind:'slime',x:0,y:0,z:0,height:1,hop:0,hp:1000,maxHp:1000,alive:true,offBalance:0});
  let e=target();assert.equal(s.h.damageEntity(e,100,0,0,{source:'slam'}).damage,134);
  e=target();e.hp=200;assert.equal(s.h.damageEntity(e,100,0,0).damage,140);
  e=target();e.offBalance=4;assert.equal(s.h.damageEntity(e,100,0,0).damage,258);
  e=target();e.offBalance=4;assert.equal(s.h.damageEntity(e,100,0,0,{source:'ally',preserveOpening:true}).damage,100);assert.equal(e.offBalance,4);
  assert.equal(s.h.meleeInterval,2);
});
test('vitality applies to healing, incoming damage, resting, revive and free respec',()=>{
  const s=setup();s.progression.load({xp:maxXp,ranks:{vitality:2,guard:2,recovery:1,bulwark:1}});assert.equal(s.h.maxHp,185);s.h.restorePlayer();assert.equal(s.h.hp,185);
  s.h.invincible=0;s.h.inSanctuary=false;s.h.damagePlayer(20);assert.equal(s.h.hp,168);s.v.usePotion();assert.equal(s.h.hp,185);
  s.progression.reset();assert.equal(s.h.hp,136);assert.equal(s.h.maxHp,136);
  s.h.hp=120;const n=s.v.residents.find(n=>n.id==='bori');Object.assign(s.p,{x:n.x,z:n.z+1,y:0});assert.ok(s.v.trade('bori','rest',s.p).accepted);assert.equal(s.h.hp,136);
});
test('kill and felling XP is awarded once; delayed kills never revive a dead player',()=>{
  const s=setup(),e=s.h.entities.find(e=>e.kind==='slime');s.h.damageEntity(e,999,0,0);assert.equal(s.progression.xp,24);s.h.damageEntity(e,999,0,0);assert.equal(s.progression.xp,24);
  s.progression.load({xp:59,ranks:{}});s.h.hp=0;const other=s.h.entities.find(e=>e.alive&&e.kind==='slime');s.h.damageEntity(other,999,0,0,{source:'ally'});assert.equal(s.progression.level,2);assert.equal(s.h.hp,0);
  const h=new Hunting([],[{id:'oak',x:0,y:0,z:0,scale:1,collider:{active:true}}]),v=new Village(h);h.equip('axe');h.damageEntity(h.forestry.trees[0],999,0,0);assert.equal(v.progression.xp,18);h.damageEntity(h.forestry.trees[0],999,0,0);assert.equal(v.progression.xp,18);
});
test('spin talents extend real duration, radius and combo waiting time',()=>{
  const s=setup();s.progression.load({xp:maxXp,ranks:{flow:2,spin:2,vortex:1,tempest:1}});s.h.equip('axe');Object.assign(s.p,{x:0,z:0,y:0});const w=s.h.warrior;w.ultimate.ready=true;w.start('spin',s.p,{x:0,z:1});assert.equal(w.active.duration,3);
  const e=s.h.entities[0];Object.assign(e,{x:3.8,z:0,y:0,hop:0,hp:9999,maxHp:9999,alive:true,offBalance:0});s.h.entities=[e,...[1,2,3].map((n)=>({...e,id:'weak-'+n,x:n,hp:1,maxHp:24}))];for(let i=0;i<700;i++)w.update(1/120,s.p);assert.ok(w.ultimate.lastSpin.hits>0);assert.equal(w.ultimate.lastSpin.duration,5);
  w.start('slam',s.p,{x:0,z:1});w.update(.7,s.p);assert.equal(w.planted.remaining,4.4);
});
test('build placement, support, obstruction, range, collision and material accounting',()=>{
  const s=setup();s.v.blocks.timber=4;const block={x:48,y:0,z:5,type:'timber'};assert.ok(s.b.place(block,s.p).accepted);assert.equal(s.v.blocks.timber,3);assert.equal(s.b.place(block,s.p).accepted,false);
  assert.equal(s.b.place({x:48,y:4,z:5,type:'timber'},s.p).accepted,false);assert.equal(s.b.place({x:60,y:0,z:5,type:'timber'},s.p).accepted,false);
  assert.equal(s.b.place({x:48,y:8,z:5,type:'timber'},s.p).accepted,false);
  s.p.vx=8;for(let i=0;i<120;i++)s.p.update(1/120,{x:1,z:0});assert.ok(s.p.x<=47.67,'player cannot pass through placed wall');
  s.p.x=45;assert.ok(s.b.remove('48,0,5',s.p).accepted);assert.equal(s.v.blocks.timber,4);assert.equal(s.b.remove('48,0,5',s.p).accepted,false);assert.equal(s.v.blocks.timber,4);
  assert.equal(s.progression.xp,0,'building cannot farm XP');
});
test('saved construction restores both visuals data and physical collision, bad records are discarded',()=>{
  const s=setup();s.v.blocks.stone=3;assert.ok(s.b.place({x:48,y:0,z:5,type:'stone'},s.p).accepted);const n=setup(s.save);assert.equal(n.b.blocks.size,1);assert.equal(n.v.blocks.stone,2);assert.equal(n.h.colliders.filter(c=>c.buildId).length,1);
  const data=JSON.parse(s.save.getItem('windfield-village-v1'));data.structures.push({x:999,y:0,z:0,type:'stone'},{x:48,y:0,z:5,type:'stone'},{x:50,y:0,z:5,type:'unknown'});s.save.setItem('windfield-village-v1',JSON.stringify(data));assert.equal(setup(s.save).b.blocks.size,1);
});
// Canvas labels are irrelevant to the real Three.js scene's geometry/colliders.
globalThis.document={hidden:false,createElement:()=>({width:1,height:1,getContext:()=>new Proxy({}, {get:()=>()=>{}})})};
const scene=new THREE.Scene(),env=createEnvironment(scene);createVillageScenery(scene,env);createRaidScenery(scene,env);
test('village is three times the area and every plot is flat, walkable and within the world',()=>{
  const ratio=VILLAGE.halfX*VILLAGE.halfZ/(15*13);assert.ok(ratio>2.9&&ratio<3.2);const s=setup(storage(),[...env.colliders]);
  for(const p of BUILD_PLOTS)for(let x=p.minX;x<p.maxX;x++)for(let z=p.minZ;z<p.maxZ;z++){assert.ok(Math.abs(terrainHeight(x+.5,z+.5))<1e-8);assert.ok(s.r.nav.clear(x+.5,z+.5));assert.ok(Math.hypot(x,z)<WORLD_RADIUS);}
  for(const n of RESIDENTS)assert.ok(s.r.nav.clear(n.x,n.z,.3),'resident spawn '+n.id);
});
test('all ten defenders and seven expedition members stage in accessible positions',()=>{
  for(const mode of ['defense','assault']){const s=setup(storage(),[...env.colliders]);assert.ok(s.r.start(mode,s.p).accepted);assert.equal(s.r.allies.length,mode==='defense'?10:7);for(const a of s.r.allies)assert.ok(s.r.nav.clear(a.x,a.z,.34),mode+' '+a.id);for(const id of ['daon','roan','lua'])assert.ok(s.r.allies.some(a=>a.id===id));
    const before=s.v.blocks.timber=2;assert.equal(s.b.place({x:48,y:0,z:5,type:'timber'},s.p).accepted,false);assert.equal(s.v.blocks.timber,before);s.r.abort();assert.ok(s.v.residents.every(n=>!n.battle));}
});
test('new melee and ranged allies can attack, and victory grants XP only once',()=>{
  const s=setup();s.r.start('assault',s.p);s.r.spawnWave();for(const id of ['daon','roan','lua']){const a=s.r.allies.find(a=>a.id===id),e=s.r.enemies[0];Object.assign(a,{x:-28,z:15,y:0});Object.assign(e,{x:-29,z:15,y:0,hp:999,alive:true});s.r.strike(a,e,s.p,true);if(a.style==='archer'){assert.ok(s.r.bolts.length);s.r.updateBolts(.06,s.p);}assert.ok(e.hp<999,id+' deals damage');}
  for(const e of s.r.enemies)s.h.damageEntity(e,10000,0,0,{source:'ally'});const before=s.progression.xp;s.r.update(.01,s.p);assert.equal(s.r.phase,'victory');assert.equal(s.progression.xp,before+180);const paid=s.progression.xp;s.r.finish(true);assert.equal(s.progression.xp,paid);
});
const parameter=()=>({value:0,setValueAtTime(v){assert.ok(Number.isFinite(v));},exponentialRampToValueAtTime(v){assert.ok(Number.isFinite(v)&&v>0);},setTargetAtTime(v){assert.ok(Number.isFinite(v));}});
const node=()=>({gain:parameter(),frequency:parameter(),Q:parameter(),threshold:parameter(),ratio:parameter(),connect(){},disconnect(){},start(){},stop(){this.onended?.();}});
globalThis.window={AudioContext:class{currentTime=0;sampleRate=8000;state='running';destination={};createGain=node;createDynamicsCompressor=node;createOscillator=node;createBiquadFilter=node;createBufferSource=node;createBuffer=(n,l)=>({getChannelData:()=>new Float32Array(l)});resume=async()=>{};close=async()=>{this.state='closed';};}};
const sound=new GameAudio(storage());await sound.unlock();
test('sound unlocks once, schedules music and all effects, and respects mute/pause preferences',()=>{
  sound.setPlaying(true);sound.schedule();assert.ok(sound.beat>0);for(const skill of ['charge','slam','kick','sweep','slash','spin']){sound.context.currentTime++;sound.event({type:'warrior-start',skill});sound.event({type:'warrior-impact',skill});}
  for(const type of ['swing','shoot','hit','spin-pulse','hurt','tree-felled','level-up','build-place','build-remove']){sound.context.currentTime++;sound.event({type,critical:true});}
  const beats=sound.beat;sound.set('enabled',false);sound.schedule();assert.equal(sound.beat,beats);sound.set('effects',.31);const restored=new GameAudio(sound.storage);assert.equal(restored.settings.enabled,false);assert.equal(restored.settings.effects,.31);sound.dispose();
});
console.log(`${count} expansion checks passed`);
