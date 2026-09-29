import assert from 'node:assert/strict';
import {Hunting} from '../dist/combat.js';
import {Movement} from '../dist/movement.js';
import {Village} from '../dist/village.js';
import {Raids} from '../dist/raids.js';
import {BATTLE,bowShot,soldierRole} from '../dist/battle-rules.js';
let count=0;const test=(name,fn)=>{fn();console.log('PASS '+name);count++;};
function setup(boxes=[]){const h=new Hunting(boxes),p=new Movement(boxes),v=new Village(h),r=new Raids(h,v);h.equip('axe');h.entities=[];Object.assign(p,{x:0,y:0,z:0});r.mode='assault';r.phase='fighting';return {h,p,v,r};}
function unit(s,style='melee',friendly=false,x=0,z=0){const u={id:Math.random().toString(),kind:'raider',raider:!friendly,style,name:'test',x,y:0,z,hp:1000,maxHp:1000,alive:true,radius:.4,height:1.9,heading:0,hop:0,flash:0,windup:0,swing:0,cooldown:0,recovery:0,knockX:0,knockZ:0,offBalance:0,step:0,damage:14,range:1.8,interval:2};s.r.skills.init(u);if(friendly)s.r.allies.push(u);else{s.r.enemies.push(u);s.h.entities.push(u);}return u;}
function tickAction(s,u,seconds,friendly=false){for(let t=0;t<seconds-1e-8;t+=1/120)s.r.skills.tick(u,1/120,s.p,friendly);}

test('dodge cancels an attack, retains a banked ultimate, has a bounded invulnerability window and cooldown',()=>{
  const s=setup();s.h.warrior.start('slam',s.p,{x:0,z:1});s.h.warrior.ultimate.ready=true;s.h.meleeCooldown=1.5;
  assert.ok(s.h.tactics.request('evade',s.p,{x:1,z:0}).accepted);assert.equal(s.h.warrior.active,null);assert.equal(s.h.warrior.ultimate.ready,true);assert.equal(s.h.meleeCooldown,1.5);
  assert.equal(s.h.damagePlayer(40),false);assert.equal(s.h.hp,100);assert.equal(s.h.attack(s.p,{x:1,z:0}),false);assert.equal(s.h.warrior.request('charge',s.p,{x:1,z:0}).queued,true);assert.equal(s.h.warrior.active,null);
  s.h.tactics.update(.3);assert.equal(s.h.tactics.invulnerable,false);assert.ok(s.h.damagePlayer(20));assert.equal(s.h.hp,80);assert.equal(s.h.tactics.request('evade',s.p,{x:1,z:0}).accepted,false);
  s.h.tactics.update(4);assert.ok(s.h.tactics.request('evade',s.p,{x:1,z:0}).accepted);s.h.hp=0;s.h.tactics.update(.01);assert.equal(s.h.tactics.dodge,null);
});
test('dodge actually moves in the selected direction and collides with a thin wall',()=>{
  for(const blocked of [false,true]){const s=setup(blocked?[{minX:-5,maxX:5,minZ:1,maxZ:1.1,bottom:0,top:3}]:[]);s.h.tactics.request('evade',s.p,{x:0,z:1});
    for(let i=0;i<51;i++){const input={x:0,z:0};s.h.warrior.movement(input,s.p);s.h.tactics.movement(input);s.p.update(1/120,input);s.h.tactics.update(1/120);}
    assert.ok(blocked?s.p.z<.67:s.p.z>3.6&&s.p.z<4.0,String(s.p.z));}
});
test('battle cry increases real damage, reduces incoming damage, expires and cannot be spammed',()=>{
  const s=setup(),e=unit(s);assert.ok(s.h.tactics.request('battlecry',s.p,{x:0,z:1}).accepted);
  assert.equal(s.h.damageEntity(e,100,0,1).damage,135);s.h.damagePlayer(40);assert.equal(s.h.hp,70);
  assert.equal(s.h.tactics.request('battlecry',s.p,{x:0,z:1}).accepted,false);s.h.tactics.update(6.01);assert.equal(s.h.damageEntity(e,100,0,1).damage,100);
  assert.ok(s.h.tactics.cooldowns.battlecry>23);s.h.restorePlayer();assert.equal(s.h.tactics.battlecry,0);assert.equal(s.h.tactics.cooldowns.battlecry,0);
});
test('shields protect the front on both sides; side attacks and a player kick counter them',()=>{
  const s=setup(),e=unit(s,'guard');e.heading=Math.PI;
  assert.equal(s.h.damageEntity(e,100,0,1).damage,35);assert.equal(s.h.damageEntity(e,100,1,0).damage,100);
  assert.equal(s.h.damageEntity(e,100,0,1,{source:'kick'}).damage,100);assert.equal(e.guardBroken,4);assert.equal(s.h.damageEntity(e,100,0,1).damage,100);
  const ally=unit(s,'guard',true);ally.heading=Math.PI;s.r.hitAlly(ally,104,{dx:0,dz:1});assert.equal(ally.hp,965);
});
test('soldier slam uses the shared player geometry and impact timing; moving away or a wall avoids it',()=>{
  for(const mode of ['hit','move','wall']){const s=setup(mode==='wall'?[{minX:-4,maxX:4,minZ:1,maxZ:1.1,bottom:0,top:3}]:[]),e=unit(s);Object.assign(s.p,{z:2.6});
    assert.ok(s.r.skills.start(e,'slam',s.r.playerTarget(s.p),false));tickAction(s,e,.625);assert.equal(s.h.hp,100);
    if(mode==='move')s.p.x=8;tickAction(s,e,.05);assert.equal(s.h.hp,mode==='hit'?100-Math.round(BATTLE.slam.damage*.55):100);
  }
  const s=setup(),a=unit(s,'melee',true),target=unit(s,'melee',false,0,2.6);assert.ok(s.r.skills.start(a,'slam',target,true));tickAction(s,a,.67,true);assert.equal(target.hp,1000-Math.round(BATTLE.slam.damage*.6));
});
test('a kick interrupts telegraphed skills without refunding their cooldown',()=>{
  const s=setup(),e=unit(s);s.p.z=2;s.r.skills.start(e,'slam',s.r.playerTarget(s.p),false);s.h.launchEntity(e,0,1,{id:'medium',duration:.4,distance:4,lift:.3});s.r.skills.tick(e,.01,s.p,false);
  assert.equal(e.action,null);assert.ok(e.skillCooldowns.slam>3);assert.equal(s.r.skills.start(e,'slam',s.r.playerTarget(s.p),false),false);assert.equal(s.h.hp,100);
});
test('archers lock the shot before firing; shared bow velocity and damage reach either side',()=>{
  const s=setup(),e=unit(s,'archer');s.p.z=7;assert.ok(s.r.skills.start(e,'shot',s.r.playerTarget(s.p),false));s.p.x=5;tickAction(s,e,1.06);assert.equal(s.r.bolts.length,1);
  const bolt=s.r.bolts[0];assert.equal(bolt.vx,0);assert.ok(Math.abs(Math.hypot(bolt.vx,bolt.vy,bolt.vz)-bowShot(1).speed)<1e-8);assert.equal(bolt.damage,24);
  for(let i=0;i<120;i++)s.r.updateBolts(1/120,s.p);assert.equal(s.h.hp,100);
  const friend=unit(s,'archer',true,3,0),enemy=unit(s,'melee',false,3,7);s.r.skills.start(friend,'shot',enemy,true);tickAction(s,friend,1.06,true);for(let i=0;i<50;i++)s.r.updateBolts(1/120,s.p);assert.equal(enemy.hp,976);
});
test('an archer dodge avoids spin damage, pull and combo credit only during its invulnerability window',()=>{
  const s=setup(),e=unit(s,'archer',false,0,2.5);e.dodge={elapsed:.1,dx:1,dz:0};
  s.h.warrior.start('spin',s.p,{x:0,z:1});s.h.warrior.active.stage=2;s.h.warrior.update(.25,s.p);
  assert.equal(e.hp,1000);assert.equal(e.z,2.5);assert.equal(s.h.warrior.active.hits,0);assert.equal(e.stagger,0);
  e.dodge.elapsed=.3;s.h.warrior.update(.25,s.p);assert.ok(e.hp<1000);assert.ok(e.z<2.5);assert.equal(s.h.warrior.active.hits,1);
});
test('same three role kits are present on both sides and surviving actors keep finite state through a battle',()=>{
  const s=setup();s.r.phase='idle';Object.assign(s.p,{x:20,z:14,y:0});assert.ok(s.r.start('defense',s.p).accepted);s.r.spawnWave();
  assert.deepEqual(new Set(s.r.enemies.map(soldierRole)),new Set(['guard','warrior','archer']));for(const role of ['guard','warrior','archer'])assert.ok(s.r.allies.some(a=>soldierRole(a)===role));
  const enemyUses=new Set(),allyUses=new Set();
  for(let i=0;i<7200&&s.r.active;i++){s.h.update(1/120,s.p);s.r.update(1/120,s.p);for(const [units,set] of [[s.r.enemies,enemyUses],[s.r.allies,allyUses]])for(const u of units){assert.ok(Number.isFinite(u.x)&&Number.isFinite(u.z)&&Number.isFinite(u.hp));for(const [id,n] of Object.entries(u.skillUses??{}))if(n)set.add(id);}}
  assert.ok(enemyUses.has('shot'));assert.ok(enemyUses.has('slam')||enemyUses.has('charge'));assert.ok(allyUses.has('shot'));assert.ok(allyUses.has('slam'));s.r.abort();assert.equal(s.r.bolts.length,0);assert.equal(s.r.enemies.length,0);
  console.log('  AI skills: enemy '+[...enemyUses].join(', ')+' / ally '+[...allyUses].join(', '));
});
console.log(`${count} tactical combat checks passed`);
