import assert from 'node:assert/strict';
import {Hunting} from '../dist/combat.js';
import {Movement,terrainHeight} from '../dist/movement.js';
import {Village} from '../dist/village.js';
import {Raids} from '../dist/raids.js';
import {RAID_WAVES,RAID_REWARDS} from '../dist/raid-data.js';
import {inHazard,BOSS_PATTERNS} from '../dist/raid-boss.js';
import {RaidBossView} from '../dist/raid-boss-view.js';
import * as THREE from '../dist/vendor/three.module.js';
import {createEnvironment} from '../dist/environment.js';
import {createVillageScenery} from '../dist/village-view.js';
import {createRaidScenery} from '../dist/raid-view.js';
let count=0;const test=(name,fn)=>{fn();console.log('PASS '+name);count++;};
function setup(colliders=[]){const h=new Hunting(colliders),p=new Movement(colliders),v=new Village(h),r=new Raids(h,v);h.entities=[];h.equip('axe');Object.assign(p,{x:45,z:5,y:0,grounded:true});return {h,p,v,r};}
function bossScene(){const s=setup();s.r.mode='assault';s.r.phase='fighting';s.r.wave=3;Object.assign(s.p,{x:-30,z:18,y:0});s.u=s.r.spawnEnemy('captain',-30,15);s.r.boss.attach(s.u);s.r.boss.cooldown=999;return s;}
function tick(s,seconds,body=()=>{}){for(let t=0;t<seconds-1e-8;t+=1/120){body();s.h.update(1/120,s.p);s.r.boss.update(1/120,s.p);}}

test('three waves have 38/29 enemies, with a single final boss; payout cannot occur early or twice',()=>{
  for(const mode of ['defense','assault']){
    const s=setup();assert.ok(s.r.start(mode,s.p).accepted);const before=s.v.gold;
    assert.equal(RAID_WAVES[mode].flat().length,mode==='defense'?38:29);
    assert.equal(RAID_WAVES[mode].flat().filter(k=>k==='captain').length,1);
    for(let wave=1;wave<=3;wave++){
      s.r.spawnWave();assert.equal(s.r.enemies.length,RAID_WAVES[mode][wave-1].length);
      assert.equal(!!s.r.boss.unit,wave===3);
      if(wave===1){const a=s.r.allies[0];a.hp=0;a.alive=false;s.h.hp=50;}
      for(const e of s.r.enemies){e.alive=false;e.hp=0;}
      s.r.update(.001,s.p);
      if(wave<3){assert.equal(s.r.phase,'interval');assert.equal(s.v.gold,before);assert.equal(s.r.timer,10);assert.ok(s.r.allies.every(a=>a.alive&&a.hp>0));assert.ok(s.h.hp>=75);}
    }
    assert.equal(s.r.phase,'victory');assert.equal(s.v.gold,before+RAID_REWARDS[mode].gold);
    s.r.finish(true);assert.equal(s.v.gold,before+RAID_REWARDS[mode].gold);assert.equal(s.v.raidWins[mode],1);
  }
});
test('floor damage waits for the full warning and stays below one third of a fresh player health bar',()=>{
  for(const id of ['cleave','embers','ring','lanes']){
    const s=bossScene();if(id==='ring')s.p.z=22;
    s.r.boss.begin(id,s.p);tick(s,BOSS_PATTERNS[id].windup-.05);assert.equal(s.h.hp,100,id+' warning');
    tick(s,.075);assert.equal(s.h.hp,100-BOSS_PATTERNS[id].damage,id+' impact');assert.ok(s.h.hp>=68);
  }
});
test('moving behind the cone, into the ring, between lanes, or off a marked circle avoids damage',()=>{
  for(const [id,x,z] of [['cleave',-30,13],['ring',-30,17],['lanes',-27.5,18],['embers',-23,18]]){
    const s=bossScene();if(id==='ring')s.p.z=22;s.r.boss.begin(id,s.p);const snapshots=s.r.boss.hazards.map(h=>[h.x,h.z,h.dx,h.dz]);
    Object.assign(s.p,{x,z,y:terrainHeight(x,z)});tick(s,BOSS_PATTERNS[id].windup+.025);
    assert.equal(s.h.hp,100,id);assert.deepEqual(s.r.boss.hazards.map(h=>[h.x,h.z,h.dx,h.dz]),snapshots,'warning does not chase the player');
  }
});
test('an actual dodge at impact avoids the floor, while a late invulnerability window does not',()=>{
  for(const early of [false,true]){const s=bossScene();s.r.boss.begin('cleave',s.p);tick(s,early?1.45:1.7);assert.ok(s.h.tactics.request('evade',s.p,{x:1,z:0}).accepted);tick(s,early?.4:.15);assert.equal(s.h.hp,early?68:100);}
});
test('overlapping explosions cannot stack; lingering fire hurts again at a readable one second interval',()=>{
  const s=bossScene();s.r.boss.addHazard({shape:'circle',x:s.p.x,z:s.p.z,radius:3,life:4.3,burn:8},'embers');
  s.r.boss.addHazard({shape:'circle',x:s.p.x,z:s.p.z,radius:3},'embers');tick(s,2.15);assert.equal(s.h.hp,76);assert.equal(s.r.boss.stats.playerHits,1);
  tick(s,1);assert.equal(s.h.hp,68);Object.assign(s.p,{x:-21});tick(s,3.3);assert.equal(s.h.hp,68);assert.equal(s.r.boss.hazards.length,0);
});
test('a real slam followed by kick interrupts the horn, prevents adds, and opens a six second damage window',()=>{
  const s=bossScene();s.p.z=16.7;s.r.boss.begin('horn',s.p);const dir={x:0,z:-1};
  assert.ok(s.h.warrior.request('slam',s.p,dir).accepted);tick(s,1.1);assert.ok(s.h.warrior.planted);
  assert.ok(s.h.warrior.request('kick',s.p,dir).accepted);tick(s,.3);
  assert.equal(s.r.boss.cast,null);assert.equal(s.r.boss.stats.interrupts,1);assert.ok(s.u.exposed>5.8);
  s.h.warrior.cancel();s.u.offBalance=0;assert.equal(s.h.damageEntity(s.u,100,0,-1).damage,140);
  tick(s,6.01);assert.equal(s.r.boss.stats.reinforcements,0);assert.ok(s.u.exposed<=0);assert.equal(s.h.damageEntity(s.u,100,0,-1).damage,100);
});
test('65% and 35% transitions each summon four adds if not interrupted, never repeatedly at low health',()=>{
  const s=bossScene();s.u.hp=s.u.maxHp*.64;s.r.boss.cooldown=0;tick(s,.01);assert.equal(s.r.boss.phase,2);assert.equal(s.r.boss.cast.id,'horn');
  tick(s,3.9);assert.equal(s.r.boss.stats.reinforcements,4);assert.equal(s.r.enemies.length,5);
  s.u.hp=s.u.maxHp*.34;s.r.boss.cooldown=0;tick(s,.01);assert.equal(s.r.boss.phase,3);assert.equal(s.r.boss.cast.id,'horn');
  tick(s,3.9);assert.equal(s.r.boss.stats.reinforcements,8);assert.equal(s.r.enemies.length,9);
  s.p.x=-16;tick(s,12);assert.equal(s.r.boss.stats.reinforcements,8);
});
test('boss resists kick knockback and spin pull/stagger, still takes critical and ordinary skill damage',()=>{
  const s=bossScene();s.r.boss.begin('cleave',s.p);const x=s.u.x,z=s.u.z;
  s.h.launchEntity(s.u,1,0,{duration:.4,distance:6,lift:1});assert.equal(s.u.knockback,null);
  s.h.warrior.start('spin',s.p,{x:0,z:-1});s.h.warrior.active.stage=2;tick(s,1.9);
  assert.equal(s.u.x,x);assert.equal(s.u.z,z);assert.equal(s.u.stagger,0);assert.equal(s.u.knockX,0);assert.ok(s.u.hp<s.u.maxHp);assert.ok(s.h.criticalHits>0);
  assert.equal(s.h.hp,68,'ordinary skills cannot cancel the cleave');
});
test('long fights shorten recovery, without shortening warnings or multiplying floor damage',()=>{
  const s=bossScene();s.r.boss.time=149.99;tick(s,.02);assert.equal(s.r.boss.enraged,true);s.r.boss.begin('cleave',s.p);assert.equal(s.r.boss.cast.duration,1.8);tick(s,1.85);assert.equal(s.h.hp,68);assert.ok(s.r.boss.cooldown<=1.1);
});
test('rendered cone/lanes have the same orientation and extents as their collision footprints',()=>{
  const s=bossScene(),view=new RaidBossView(new THREE.Scene(),s.r.boss);s.p.x=-24;s.p.z=15;
  for(const id of ['cleave','lanes','ring']){s.r.boss.hazards=[];s.r.boss.begin(id,s.p);for(const h of s.r.boss.hazards){const g=view.geometry(h),p=g.attributes.position;
    for(let i=0;i<p.count;i++)assert.ok(inHazard(h,{x:p.getX(i)+h.x,z:p.getZ(i)+h.z},.002),id+' vertex '+i);g.dispose();}}
  view.update();assert.ok(view.shapes.size);const oldIds=new Set(view.shapes.keys());
  s.r.boss.attach(s.u);s.r.boss.begin('lanes',s.p);view.update();assert.equal(view.shapes.size,3);assert.ok([...view.shapes.keys()].every(id=>!oldIds.has(id)),'restarting before the next frame must not reuse old floor geometry');
  s.r.boss.clear();view.update();assert.equal(view.shapes.size,0);
});
test('death, retreat, and restart remove casts, fire, and outstanding damage',()=>{
  const s=setup();s.r.start('defense',s.p);s.r.wave=3;s.r.spawnWave();s.r.boss.begin('embers',s.p);s.r.abort();assert.equal(s.r.boss.hazards.length,0);assert.equal(s.r.boss.cast,null);assert.equal(s.r.enemies.length,0);assert.equal(s.r.allies.length,0);
  assert.ok(s.r.start('assault',s.p).accepted);assert.equal(s.r.wave,1);assert.equal(s.r.boss.unit,null);s.r.wave=3;s.r.spawnWave();s.r.boss.begin('embers',s.p);s.r.boss.unit.alive=false;s.r.boss.update(.01,s.p);assert.equal(s.r.boss.hazards.length,0);assert.equal(s.r.boss.cast,null);
});

// Use the actual scenery collision map, including houses, camp tents and trees.
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>new Proxy({}, {get:()=>()=>{}})})};
const scene=new THREE.Scene(),env=createEnvironment(scene);createVillageScenery(scene,env);createRaidScenery(scene,env);
test('every wave and reinforcement spawns outside real scenery collision',()=>{
  for(const mode of ['defense','assault'])for(let wave=1;wave<=3;wave++){
    const s=setup([...env.colliders]);s.r.start(mode,s.p);s.r.wave=wave;s.r.spawnWave();if(wave===3)s.r.spawnReinforcements(s.r.boss.unit,3);
    for(const e of s.r.enemies)assert.ok(s.r.nav.clear(e.x,e.z,e.radius),mode+' wave '+wave+' '+e.id+' '+e.x+','+e.z);
  }
});
test('residents react to floor warnings and walk out, rather than receiving hidden immunity',()=>{
  const s=setup([...env.colliders]);s.r.start('assault',s.p);s.r.wave=3;s.r.spawnWave();const b=s.r.boss;s.r.enemies=s.r.enemies.filter(e=>e.boss);s.h.entities=s.r.enemies;
  const a=s.r.allies[0];Object.assign(a,{x:-29,z:15,y:0});const h=b.addHazard({shape:'circle',x:a.x,z:a.z,radius:2.7},'embers');
  assert.equal(b.avoid(a,0,.1),false,'reaction delay');let reacted=false;
  for(let i=0;i<260;i++){b.update(1/120,s.p);reacted=b.avoid(a,0,1/120)||reacted;}
  assert.ok(reacted);assert.ok(!inHazard(h,a,.4));assert.ok(s.r.nav.clear(a.x,a.z));assert.equal(a.hp,a.maxHp);
  h.x=a.x;h.z=a.z;b.hitGrace.clear();b.hit(h,a,24);assert.equal(a.hp,a.maxHp-24);
});
test('doing nothing cannot win either full encounter with resident AI alone',()=>{
  for(const mode of ['defense','assault']){
    const s=setup([...env.colliders]);s.r.start(mode,s.p);let maxWave=1,time=0;
    for(;s.r.active&&time<481;time+=1/60){s.h.update(1/60,s.p);s.r.update(1/60,s.p);s.h.autoAttack(s.p);maxWave=Math.max(maxWave,s.r.wave);s.h.events.length=0;}
    assert.equal(s.r.result?.won,false,mode+' residents won without player input');console.log(`  AFK ${mode}: ${time.toFixed(1)}s, wave ${maxWave}, ${s.r.result?.reason}`);
  }
});
console.log(`${count} raid boss checks passed`);
