import assert from 'node:assert/strict';
import {Hunting} from '../dist/combat.js';
import {Village} from '../dist/village.js';
import {Movement} from '../dist/movement.js';
import {FieldHunt} from '../dist/field-hunt.js';
import {FIELD} from '../dist/field-data.js';

// Chase and rotate skills with real movement, but never read a warning or bait a stone.
// This catches damage races that the stationary/no-skills playthrough cannot detect.
function bruteForce({rotation='long',armor=0,nari=false,xp=0,ranks={},seed=7}={}){
  const h=new Hunting(),p=new Movement(),v=new Village(h),r=new FieldHunt(h,v),dt=1/120;
  h.entities=[];h.equip('axe');v.progression.load({xp,ranks});h.hp=h.maxHp;h.armorLevel=armor;v.potions=1;
  h.warrior.kickPower.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  Object.assign(p,{x:20,z:15,y:0});r.acceptQuest(p);Object.assign(p,{...FIELD.entry,y:0});r.start('field',p,nari?'nari':'none');
  let decision=0;const u=r.boss.unit;
  for(let time=0;time<300&&r.active;time+=dt){
    const d=Math.hypot(u.x-p.x,u.z-p.z)||1,dir={x:(u.x-p.x)/d,z:(u.z-p.z)/d};
    if(decision--<=0){
      decision=12;
      if(d<4.1){
        h.warrior.setAim(dir);h.tactics.request('battlecry',p,dir);
        if(!h.warrior.active||h.warrior.active.id==='slash'){
          const id=h.warrior.ultimate.ready?'spin':h.warrior.followup?(rotation==='short'||h.warrior.followup.kicked?'sweep':'kick'):rotation==='short'||h.warrior.combo.step===1?'slam':'charge';
          h.warrior.request(id,p,dir);
        }
      }
      if(h.hp<h.maxHp-45&&v.potions)v.usePotion();
    }
    const input={x:d>2.7?dir.x:0,z:d>2.7?dir.z:0,sprint:false};
    h.warrior.movement(input,p);h.tactics.movement(input);p.update(dt,input);h.update(dt,p);r.update(dt,p);v.update(dt,p);h.autoAttack(p);h.events=[];
  }
  assert.ok(r.result,'combat resolves without a timeout');
  assert.equal(r.result.won,false,'ignoring every mechanic must lose the damage race');
  assert.equal(v.huntQuest.clears,0);assert.equal(r.result.bossStats.stoneBreaks,0);
  assert.equal(v.potions,0,'gave the damage race its healing potion');
  assert.ok(h.warrior.executions.slam>=3&&h.warrior.executions.sweep>=3&&h.warrior.executions.spin>=1,'really attacked with combos and the ultimate');
  assert.ok(u.hp<FIELD.health*.8,'actually dealt damage instead of missing the boss');
}
for(const rotation of ['short','long'])for(const armor of [0,1,3]){
  for(const seed of [1,7,42])bruteForce({rotation,armor,seed});
  console.log(`PASS Varkan resists ${rotation} combo spam with armor ${armor}, battlecry and a potion (3 kick seeds)`);
}
bruteForce({armor:1,nari:true});
console.log('PASS three companion heals do not replace all mechanics with starter armor');
bruteForce({armor:1,xp:310,ranks:{power:2,vitality:2}});
console.log('PASS early attack/health talents still require some boss mechanics');
console.log('8 first-boss balance checks passed');
