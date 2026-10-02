import assert from 'node:assert/strict';
import {Hunting} from '../dist/combat.js';
import {Village} from '../dist/village.js';
import {Movement} from '../dist/movement.js';
import {FieldHunt} from '../dist/field-hunt.js';
import {FIELD} from '../dist/field-data.js';
import {inHazard} from '../dist/raid-boss.js';
const h=new Hunting(),p=new Movement(),v=new Village(h),r=new FieldHunt(h,v),dt=1/120;
h.entities=[];h.equip('axe');Object.assign(p,{x:20,z:15,y:0});r.acceptQuest(p);Object.assign(p,{x:-19,z:15,y:0});r.start('field',p,process.argv.includes('--nari')?'nari':'none');
let goal=null,decision=0;
for(let time=0;time<600&&r.active;time+=dt){
  const b=r.boss,u=b.unit,d=Math.hypot(u.x-p.x,u.z-p.z)||1,dir={x:(u.x-p.x)/d,z:(u.z-p.z)/d};
  if(decision--<=0){
    decision=12;const mark=b.hazards.find(a=>a.trackUntil&&!a.fired),stone=b.stones.find(a=>a.charged);
    const threats=b.hazards.filter(a=>(a.fired?a.burn:a.delay-a.age<2.05)&&!(a.trackUntil&&!a.locked));
    if(mark&&!mark.locked){
      if(stone)goal={x:stone.x,z:stone.z};
      else {const dist=Math.hypot(p.x-FIELD.x,p.z-FIELD.z)||1;goal={x:FIELD.x+(p.x-FIELD.x)/dist*13,z:FIELD.z+(p.z-FIELD.z)/dist*13};}
    }else{
      const candidates=[];
      for(const radius of [0,2,3.1,4.8,6,9,12])for(let a=0;a<24;a++){const x=u.x+Math.cos(a*Math.PI/12)*radius,z=u.z+Math.sin(a*Math.PI/12)*radius;if(Math.hypot(x-FIELD.x,z-FIELD.z)>17||threats.some(h=>inHazard(h,{x,z},.65)))continue;candidates.push({x,z,score:Math.hypot(x-p.x,z-p.z)+(radius>3.2?4:0)});}
      goal=candidates.sort((a,b)=>a.score-b.score)[0]??{x:p.x+dir.z*4,z:p.z-dir.x*4};
    }
    const danger=threats.some(a=>inHazard(a,p,.3));
    if(danger&&(h.warrior.active||h.warrior.planted))h.tactics.request('evade',p,{x:goal.x-p.x,z:goal.z-p.z});
    if(!danger&&(!mark||mark.locked)&&d<4.1){
      h.warrior.setAim(dir);
      if(u.exposed>0)h.tactics.request('battlecry',p,dir);
      if(!h.warrior.active||h.warrior.active.id==='slash'){
        const id=h.warrior.ultimate.ready?'spin':h.warrior.followup?(h.warrior.followup.kicked?'sweep':'kick'):h.warrior.combo.step===1?'slam':'charge';h.warrior.request(id,p,dir);
      }
    }
    if(h.hp<35&&v.potions)v.usePotion();
  }
  const dist=Math.hypot(goal.x-p.x,goal.z-p.z)||1,input={x:dist>.35?(goal.x-p.x)/dist:0,z:dist>.35?(goal.z-p.z)/dist:0,sprint:false};
  h.warrior.movement(input,p);h.tactics.movement(input);p.update(dt,input);h.update(dt,p);r.update(dt,p);v.update(dt,p);h.autoAttack(p);
  h.events=[];
}
assert.equal(r.result?.won,true,'real movement and skills can complete a solo hunt');
assert.ok(r.result.bossStats.stoneBreaks>=2,'successful lightning baits across phases');
assert.ok(h.hp>0);assert.equal(v.huntQuest.clears,1);
console.log(`PASS full solo hunt with movement, skills, pattern avoidance and stone baits (${r.result.elapsed}s simulated)`);
h.restorePlayer();Object.assign(p,{x:-19,z:15,y:0});r.start('field',p);
for(let t=0;t<400&&r.active;t+=dt){p.update(dt,{x:0,z:0});h.update(dt,p);r.update(dt,p);h.autoAttack(p);h.events=[];}
assert.equal(r.result?.won,false,'idling through mechanics cannot win');assert.equal(v.huntQuest.clears,1);
console.log('PASS ignoring mechanics fails without awarding a second clear');
console.log('2 outdoor playthrough checks passed');