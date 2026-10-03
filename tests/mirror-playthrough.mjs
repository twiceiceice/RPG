import assert from 'node:assert/strict';
import {Hunting} from '../dist/combat.js';
import {Village} from '../dist/village.js';
import {Movement} from '../dist/movement.js';
import {FieldHunt} from '../dist/field-hunt.js';
import {MIRROR_FIELD as FIELD} from '../dist/field-data.js';
import {createEnvironment} from '../dist/environment.js';
import {createMirrorScenery} from '../dist/mirror-view.js';
import {inHazard} from '../dist/raid-boss.js';
import * as THREE from '../dist/vendor/three.module.js';
const scene=new THREE.Scene(),env=createEnvironment(scene);createMirrorScenery(scene,env);
const h=new Hunting(env.colliders),p=new Movement(env.colliders),v=new Village(h),r=new FieldHunt(h,v),dt=1/120;
h.entities=[];h.equip('axe');Object.assign(p,{x:20,z:15,y:0});r.select('lysea');r.acceptQuest(p);Object.assign(p,{...FIELD.entry,y:0});r.start('field',p);
const shortRoute=process.argv.includes('--short');
let goal={...FIELD.entry},decision=0,route=[],lastCast=null;
for(let time=0;time<600&&r.active;time+=dt){
  const b=r.boss,u=b.unit,target=b.projections.find(e=>e.alive&&e.realMirror)??u,d=Math.hypot(target.x-p.x,target.z-p.z)||1,dir={x:(target.x-p.x)/d,z:(target.z-p.z)/d};
  if(decision--<=0){
    decision=12;const flash=b.hazards.find(a=>a.requiresCover&&!a.fired),threats=b.hazards.filter(a=>!a.requiresCover&&(a.fired?a.burn:a.delay-a.age<2.05));
    const dangerAt=(point,margin=.55)=>threats.some(a=>{
      if(inHazard(a,point,margin))return true;
      if(!a.rotationSpeed)return false;
      const angle=Math.atan2(a.dx,a.dz)+.5*a.rotationSpeed;return inHazard({...a,dx:Math.sin(angle),dz:Math.cos(angle)},point,margin);
    });
    if(flash)goal=b.coverGoal(p);
    else {
      const candidates=[];
      for(const radius of [2.5,3.1,4.8,6,9,12])for(let a=0;a<32;a++){
        const x=target.x+Math.cos(a*Math.PI/16)*radius,z=target.z+Math.sin(a*Math.PI/16)*radius;
        if(Math.hypot(x-FIELD.x,z-FIELD.z)>16||!r.nav.clear(x,z,.55)||dangerAt({x,z}))continue;
        candidates.push({x,z,score:Math.hypot(x-p.x,z-p.z)+(radius>3.2?4:0)});
      }
      goal=candidates.sort((a,b)=>a.score-b.score)[0]??goal;
    }
    route=r.nav.direct(p,goal)?[]:r.nav.path(p,goal);
    const danger=!!flash||dangerAt(p,.3);
    if(danger&&(h.warrior.active||h.warrior.planted))h.tactics.request('evade',p,{x:goal.x-p.x,z:goal.z-p.z});
    if(!danger&&d<4.1){
      h.warrior.setAim(dir);
      if(u.exposed>0)h.tactics.request('battlecry',p,dir);
      if(!h.warrior.active||h.warrior.active.id==='slash'){
        const id=h.warrior.ultimate.ready&&!u.mirrorVeiled?'spin':h.warrior.followup?(shortRoute||h.warrior.followup.kicked?'sweep':'kick'):shortRoute||h.warrior.combo.step===1?'slam':'charge';h.warrior.request(id,p,dir);
      }
    }
    if(h.hp<35&&v.potions)v.usePotion();
    if(process.argv.includes('--trace')&&lastCast!==b.cast?.id){console.log(time.toFixed(1),b.cast?.id,h.hp,u.hp,b.stats,Math.round(p.x),Math.round(p.z));lastCast=b.cast?.id;}
  }
  while(route.length&&Math.hypot(route[0].x-p.x,route[0].z-p.z)<.35)route.shift();
  const step=route[0]??goal,dist=Math.hypot(step.x-p.x,step.z-p.z)||1,input={x:dist>.25?(step.x-p.x)/dist:0,z:dist>.25?(step.z-p.z)/dist:0,sprint:false};
  h.warrior.movement(input,p);h.tactics.movement(input);p.update(dt,input);h.update(dt,p);r.update(dt,p);v.update(dt,p);h.autoAttack(p);h.events=[];
}
assert.equal(r.result?.won,true,'real movement around solid pillars and weapon skills can complete a solo hunt');
assert.ok(r.result.bossStats.mirrorBreaks>=2);assert.ok(r.result.bossStats.coverSuccess>=1);assert.equal(v.mirrorQuest.clears,1);assert.equal(v.huntQuest.clears,0);
if(shortRoute){assert.equal(h.warrior.executions.charge,0);assert.equal(h.warrior.executions.kick,0);assert.ok(h.warrior.executions.spin>0);}
console.log(`PASS ${shortRoute?'short-route':'full'} solo Lysea hunt using real movement, terrain cover and shadow recognition (${r.result.elapsed}s simulated)`);
h.restorePlayer();Object.assign(p,{...FIELD.entry,y:0,vx:0,vz:0,vy:0});assert.ok(r.start('field',p).accepted);
for(let time=0;time<400&&r.active;time+=dt){p.update(dt,{x:0,z:0});h.update(dt,p);r.update(dt,p);h.autoAttack(p);h.events=[];}
assert.equal(r.result?.won,false,'idling through the encounter fails');assert.equal(v.mirrorQuest.clears,1);assert.equal(v.huntQuest.clears,0);
console.log('PASS ignoring Lysea mechanics fails without granting another clear');
console.log('2 mirror playthrough checks passed');
