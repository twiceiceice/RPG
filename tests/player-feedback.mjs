import assert from 'node:assert/strict';
import {Hunting} from '../dist/combat.js';
import {Village} from '../dist/village.js';
import {Movement} from '../dist/movement.js';
import {FieldHunt} from '../dist/field-hunt.js';
import {FIELD,MIRROR_FIELD,MIRROR_PATTERNS} from '../dist/field-data.js';
import {PlayerFeedback} from '../dist/player-feedback.js';

let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
function hurt(h){return h.events.filter(e=>e.type==='hurt').at(-1);}
function feedback(h){return new PlayerFeedback(h.hp,h.maxHp);}
function takeHit(h,f,damage,source='뿔 휩쓸기'){
  assert.ok(h.damagePlayer(damage,{source}));const event=hurt(h);f.hit(event);return event;
}
function encounter(id){
  const h=new Hunting(),p=new Movement(),v=new Village(h),r=new FieldHunt(h,v);
  h.entities=[];Object.assign(p,{x:20,y:0,z:15});r.select(id);assert.ok(r.acceptQuest(p).accepted);
  Object.assign(p,{...(id==='varkan'?FIELD:MIRROR_FIELD).entry,y:0});assert.ok(r.start('field',p).accepted);
  r.boss.cooldown=999;return {h,p,r};
}
function tick(s,seconds){for(let t=0;t<seconds-1e-7;t+=1/120){s.h.update(1/120,s.p);s.r.update(1/120,s.p);}}

test('incoming feedback reports actual health lost after armor and battle cry, including lethal overkill',()=>{
  const h=new Hunting(),f=feedback(h);h.armorLevel=2;h.tactics.battlecry=6;
  const hit=takeHit(h,f,20);
  assert.equal(h.hp,88);assert.equal(hit.damage,12);assert.equal(hit.healthBefore,100);assert.equal(hit.health,88);
  assert.equal(f.notice.damage,12);assert.equal(f.notice.source,'뿔 휩쓸기');
  h.invincible=0;h.hp=7;const lethal=takeHit(h,f,1000);
  assert.equal(lethal.damage,7);assert.equal(lethal.health,0);assert.equal(h.hp,0);
});

test('dodged, invulnerable, sanctuary and already-dead players never create incoming damage feedback',()=>{
  for(const mode of ['dodge','invincible','sanctuary','dead']){
    const h=new Hunting();
    if(mode==='dodge')h.tactics.dodge={elapsed:0};
    if(mode==='invincible')h.invincible=1;
    if(mode==='sanctuary')h.inSanctuary=true;
    if(mode==='dead')h.hp=0;
    const before=h.hp;assert.equal(h.damagePlayer(18,{source:'회피한 공격'}),false,mode);
    assert.equal(h.hp,before);assert.equal(hurt(h),undefined,mode);
  }
});

test('damage after passive regeneration stays readable without changing fractional health loss',()=>{
  const h=new Hunting(),p=new Movement(),f=feedback(h);h.entities=[];h.hp=64.99;h.sinceHit=7;
  h.update(1/60,p);const regenerated=h.hp;assert.ok(regenerated>64.99);
  const hit=takeHit(h,f,16);assert.equal(hit.health,regenerated-16);assert.equal(f.notice.damage,16);
  h.invincible=0;const remaining=h.hp,lethal=takeHit(h,f,1000);
  assert.equal(lethal.damage,remaining);assert.equal(h.hp,0);assert.equal(f.notice.damage,49.1);
});

test('Varkan events distinguish the original brand from its lingering ground damage',()=>{
  const s=encounter('varkan');s.r.boss.begin('brand',s.p);tick(s,4.05);
  assert.equal(hurt(s.h).source,'번개 낙인');assert.equal(hurt(s.h).damage,20);
  tick(s,1.05);assert.equal(hurt(s.h).source,'잔류 번개');assert.equal(hurt(s.h).damage,10);
  assert.equal(s.h.events.filter(e=>e.type==='hurt').length,2);
});

test('Lysea damage carries the actual spell name through the shared player damage path',()=>{
  const s=encounter('lysea');s.r.boss.begin('gaze',s.p);tick(s,MIRROR_PATTERNS.gaze.windup+.1);
  assert.equal(hurt(s.h).source,MIRROR_PATTERNS.gaze.name);
  assert.equal(hurt(s.h).damage,MIRROR_PATTERNS.gaze.damage);
});

test('the lost health segment holds briefly then catches up, while the receipt outlives the central number',()=>{
  const h=new Hunting(),f=feedback(h);takeHit(h,f,16);
  f.update(.4,h.hp,h.maxHp);assert.equal(f.trailHealth,100);assert.ok(f.notice.remaining>0);
  f.update(.3,h.hp,h.maxHp);assert.ok(f.trailHealth>84&&f.trailHealth<100);
  f.update(1,h.hp,h.maxHp);assert.equal(f.trailHealth,84);assert.equal(f.notice.remaining,0);assert.ok(f.notice.receiptRemaining>0);
  assert.equal(f.flash,0);f.update(3,h.hp,h.maxHp);assert.equal(f.notice,null);
});

test('a subsequent hit replaces the central number and preserves the recent loss segment',()=>{
  const h=new Hunting(),f=feedback(h);takeHit(h,f,16);f.update(.7,h.hp,h.maxHp);
  const trail=f.trailHealth;h.invincible=0;takeHit(h,f,4,'잔류 번개');
  assert.equal(f.notice.damage,4);assert.equal(f.notice.source,'잔류 번개');assert.equal(f.trailHealth,trail);
  f.update(.4,h.hp,h.maxHp);assert.equal(f.trailHealth,trail);assert.equal(h.hp,80);
});

test('healing and max-health changes cannot be mistaken for a fresh damage segment',()=>{
  const h=new Hunting(),v=new Village(h),f=feedback(h);takeHit(h,f,60);
  assert.ok(v.usePotion().accepted);f.update(.1,h.hp,h.maxHp);assert.equal(h.hp,85);assert.equal(f.trailHealth,85);
  f.update(0,150,180);assert.equal(f.trailHealth,150);assert.equal(f.maxHealth,180);
});

test('pause freezes feedback, recovery clears it, and danger uses a percentage of maximum health',()=>{
  const h=new Hunting(),f=feedback(h);takeHit(h,f,72);
  const before=JSON.stringify(f);f.update(0,h.hp,h.maxHp);assert.equal(JSON.stringify(f),before);
  assert.ok(f.lowHealth);h.restorePlayer();f.reset(h.hp,h.maxHp);
  assert.equal(f.notice,null);assert.equal(f.flash,0);assert.equal(f.trailHealth,h.maxHp);assert.equal(f.lowHealth,false);
  f.update(0,60,200);assert.equal(f.lowHealth,true);f.update(0,61,200);assert.equal(f.lowHealth,false);
});
console.log(`${count} player feedback checks passed`);
